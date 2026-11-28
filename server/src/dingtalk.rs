//! 钉钉组织架构同步与工作通知。
//!
//! 登录走钉钉 OAuth（api.dingtalk.com）；组织架构和工作通知走服务端应用凭据
//! （oapi.dingtalk.com）。AppSecret 只在这里使用，不下发浏览器。
//! `DINGTALK_API_BASE` 可指向测试桩，便于在没有企业凭据时回归解析逻辑。

use crate::api::Config;
use crate::domain::ApiError;
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::json;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{channel, Sender};
use tokio::sync::Semaphore;

#[derive(Debug, Clone)]
pub struct OrgUser {
    pub userid: String,
    pub unionid: Option<String>,
    pub name: String,
    pub mobile: Option<String>,
    pub avatar: Option<String>,
    pub title: Option<String>,
    pub department_ids: Vec<String>,
    pub active: bool,
}

#[derive(Debug, Clone)]
pub struct WorkNotice {
    pub userid: String,
    pub title: String,
    pub body: String,
}

#[derive(Deserialize)]
struct OapiResponse<T> {
    #[serde(default)]
    errcode: i64,
    #[serde(default)]
    errmsg: String,
    result: Option<T>,
}

#[derive(Deserialize)]
struct TokenResponse {
    #[serde(default)]
    errcode: i64,
    #[serde(default)]
    errmsg: String,
    #[serde(default)]
    access_token: String,
    #[serde(default)]
    expires_in: i64,
}

#[derive(Deserialize)]
struct Department {
    dept_id: i64,
}

#[derive(Deserialize)]
struct UserListResult {
    #[serde(default)]
    list: Vec<RawUser>,
    #[serde(default)]
    has_more: bool,
    #[serde(default)]
    next_cursor: i64,
}

#[derive(Deserialize)]
struct RawUser {
    #[serde(default)]
    userid: String,
    #[serde(default)]
    unionid: Option<String>,
    #[serde(default)]
    name: String,
    #[serde(default)]
    mobile: Option<String>,
    #[serde(default)]
    avatar: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    dept_id_list: Vec<i64>,
    #[serde(default = "default_active")]
    active: bool,
}

fn default_active() -> bool {
    true
}

fn bad_gateway(message: impl Into<String>) -> ApiError {
    ApiError::new(StatusCode::BAD_GATEWAY, message)
}

fn missing_credentials() -> ApiError {
    ApiError::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "钉钉应用凭据未配置（DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET）",
    )
}

static TOKEN_CACHE: OnceLock<Mutex<Option<(String, Instant)>>> = OnceLock::new();
static NOTIFIER: OnceLock<Sender<WorkNotice>> = OnceLock::new();

fn cache() -> &'static Mutex<Option<(String, Instant)>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(None))
}

pub async fn app_token(config: &Config) -> Result<String, ApiError> {
    let client_id = config
        .dingtalk_client_id
        .as_deref()
        .ok_or_else(missing_credentials)?;
    let client_secret = config
        .dingtalk_client_secret
        .as_deref()
        .ok_or_else(missing_credentials)?;
    if let Ok(guard) = cache().lock() {
        if let Some((token, expires_at)) = guard.as_ref() {
            if *expires_at > Instant::now() {
                return Ok(token.clone());
            }
        }
    }
    let url = format!(
        "{}/gettoken?appkey={}&appsecret={}",
        config.dingtalk_api_base,
        url_encode(client_id),
        url_encode(client_secret)
    );
    let response = http_client()?
        .get(url)
        .timeout(DINGTALK_TIMEOUT)
        .send()
        .await
        .map_err(|error| bad_gateway(format!("钉钉 gettoken 请求失败：{}", error.without_url())))?;
    let status = response.status();
    let body: TokenResponse = response
        .json()
        .await
        .map_err(|error| bad_gateway(format!("钉钉 gettoken 响应不合法（{status}）：{error}")))?;
    if !status.is_success() || body.errcode != 0 {
        return Err(bad_gateway(format!(
            "钉钉 gettoken 失败（{}）：{}",
            body.errcode, body.errmsg
        )));
    }
    let ttl = body.expires_in.clamp(60, 7200);
    let token = body.access_token;
    if token.is_empty() {
        return Err(bad_gateway("钉钉 gettoken 没有返回 access_token"));
    }
    if let Ok(mut guard) = cache().lock() {
        *guard = Some((
            token.clone(),
            Instant::now() + Duration::from_secs(ttl as u64 - 30),
        ));
    }
    Ok(token)
}

/// 全进程共用一个连接池：每次调用都新建 Client 会丢掉连接复用和 DNS 缓存。
/// 超时按请求设置（见 [`GITLAB_TIMEOUT`] / [`DINGTALK_TIMEOUT`]），各集成互不影响。
pub(crate) fn shared_http_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("reqwest client with static settings cannot fail")
    })
}

pub(crate) const DINGTALK_TIMEOUT: Duration = Duration::from_secs(15);

pub(crate) fn http_client() -> Result<reqwest::Client, ApiError> {
    Ok(shared_http_client().clone())
}

pub(crate) fn url_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

pub async fn fetch_org(config: &Config) -> Result<(Vec<i64>, Vec<OrgUser>), ApiError> {
    let token = app_token(config).await?;
    let client = http_client()?;
    let root = config.dingtalk_sync_root_dept;
    let mut departments = vec![root];
    let mut queue = VecDeque::from([root]);
    let mut seen_departments = HashSet::from([root]);
    while let Some(dept_id) = queue.pop_front() {
        let url = format!(
            "{}/topapi/v2/department/listsub?access_token={}",
            config.dingtalk_api_base,
            url_encode(&token)
        );
        let response = client
            .post(url)
            .timeout(DINGTALK_TIMEOUT)
            .json(&json!({ "dept_id": dept_id }))
            .send()
            .await
            .map_err(|error| {
                bad_gateway(format!("钉钉部门列表请求失败：{}", error.without_url()))
            })?;
        let body: OapiResponse<Vec<Department>> = response
            .json()
            .await
            .map_err(|error| bad_gateway(format!("钉钉部门列表响应不合法：{error}")))?;
        if body.errcode != 0 {
            return Err(bad_gateway(format!(
                "钉钉部门列表失败（{}）：{}",
                body.errcode, body.errmsg
            )));
        }
        for department in body.result.unwrap_or_default() {
            if seen_departments.insert(department.dept_id) {
                departments.push(department.dept_id);
                queue.push_back(department.dept_id);
            }
        }
    }

    let mut users: HashMap<String, OrgUser> = HashMap::new();
    // 部门数量多时逐个串行拉取成员非常慢；用信号量限制并发（默认 6）并行拉取。
    let dep_base = config.dingtalk_api_base.clone();
    let semaphore = std::sync::Arc::new(Semaphore::new(6));
    let mut handles = Vec::new();
    for dept_id in departments.clone() {
        let permit = semaphore.clone();
        let client = client.clone();
        let base = dep_base.clone();
        let token = token.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit.acquire_owned().await.ok();
            fetch_department_users(&client, &base, &token, dept_id).await
        }));
    }
    for handle in handles {
        let raws = match handle.await {
            Ok(Ok(list)) => list,
            Ok(Err(error)) => return Err(error),
            Err(error) => return Err(bad_gateway(format!("钉钉成员列表任务失败：{error}"))),
        };
        for raw in raws {
            if raw.userid.is_empty() {
                continue;
            }
            users.entry(raw.userid.clone()).or_insert_with(|| OrgUser {
                userid: raw.userid,
                unionid: raw.unionid,
                name: raw.name,
                mobile: raw.mobile,
                avatar: raw.avatar,
                title: raw.title,
                department_ids: raw.dept_id_list.iter().map(|id| id.to_string()).collect(),
                active: raw.active,
            });
        }
    }
    let mut users: Vec<OrgUser> = users.into_values().collect();
    users.sort_by(|a, b| a.userid.cmp(&b.userid));
    Ok((departments, users))
}

/// 拉取单个部门的全部成员（自动翻页）。抽出来便于并发调用。
async fn fetch_department_users(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    dept_id: i64,
) -> Result<Vec<RawUser>, ApiError> {
    let mut collected = Vec::new();
    let mut cursor = 0i64;
    loop {
        let url = format!(
            "{}/topapi/v2/user/list?access_token={}",
            base,
            url_encode(token)
        );
        let response = client
            .post(url)
            .timeout(DINGTALK_TIMEOUT)
            .json(&json!({ "dept_id": dept_id, "cursor": cursor, "size": 100 }))
            .send()
            .await
            .map_err(|error| {
                bad_gateway(format!("钉钉成员列表请求失败：{}", error.without_url()))
            })?;
        let body: OapiResponse<UserListResult> = response
            .json()
            .await
            .map_err(|error| bad_gateway(format!("钉钉成员列表响应不合法：{error}")))?;
        if body.errcode != 0 {
            return Err(bad_gateway(format!(
                "钉钉成员列表失败（{}）：{}",
                body.errcode, body.errmsg
            )));
        }
        let result = body.result.unwrap_or(UserListResult {
            list: Vec::new(),
            has_more: false,
            next_cursor: 0,
        });
        collected.extend(result.list);
        if !result.has_more || result.next_cursor <= cursor {
            break;
        }
        cursor = result.next_cursor;
    }
    Ok(collected)
}

pub async fn send_work_notice(config: &Config, notice: &WorkNotice) -> Result<(), ApiError> {
    let agent_id = config
        .dingtalk_agent_id
        .as_deref()
        .ok_or_else(|| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "缺少 DINGTALK_AGENT_ID"))?;
    let token = app_token(config).await?;
    let link = config
        .public_url
        .as_deref()
        .map(|url| format!("\n\n[打开研发工作台]({url})"))
        .unwrap_or_default();
    let text = format!("### {}\n\n{}{}", notice.title, notice.body, link);
    let url = format!(
        "{}/topapi/message/corpconversation/asyncsend_v2?access_token={}",
        config.dingtalk_api_base,
        url_encode(&token)
    );
    let response = http_client()?
        .post(url)
        .timeout(DINGTALK_TIMEOUT)
        .json(&json!({
            "agent_id": agent_id,
            "userid_list": notice.userid,
            "msg": {
                "msgtype": "markdown",
                "markdown": { "title": notice.title, "text": text }
            }
        }))
        .send()
        .await
        .map_err(|error| bad_gateway(format!("钉钉工作通知请求失败：{}", error.without_url())))?;
    let body: OapiResponse<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| bad_gateway(format!("钉钉工作通知响应不合法：{error}")))?;
    if body.errcode != 0 {
        return Err(bad_gateway(format!(
            "钉钉工作通知失败（{}）：{}",
            body.errcode, body.errmsg
        )));
    }
    Ok(())
}

/// 启动工作通知消费者。只在显式开启 DINGTALK_WORK_NOTIFY 且配置 AgentId 时调用。
pub fn init_notifier(config: std::sync::Arc<Config>) {
    // 有界队列：钉钉慢或挂掉时最多积压 N 条，超出丢弃并告警，避免内存无限增长。
    let (tx, mut rx) = channel::<WorkNotice>(1024);
    if NOTIFIER.set(tx).is_err() {
        return;
    }
    tokio::spawn(async move {
        // sender 全部释放后 recv 会先返回剩余缓冲消息、再返回 None，实现优雅排空。
        while let Some(notice) = rx.recv().await {
            send_with_retry(&config, &notice).await;
        }
        tracing::info!("钉钉工作通知队列已排空并退出");
    });
}

/// 发送失败按指数退避重试（最多 3 次），仍失败只告警、不阻塞队列。
async fn send_with_retry(config: &Config, notice: &WorkNotice) {
    let mut attempt = 0u32;
    loop {
        match send_work_notice(config, notice).await {
            Ok(()) => return,
            Err(error) => {
                attempt += 1;
                if attempt >= 3 {
                    tracing::warn!(
                        "钉钉工作通知最终失败（已重试 {} 次）：{}",
                        attempt - 1,
                        error.message
                    );
                    return;
                }
                tokio::time::sleep(Duration::from_millis(500 * 2u64.pow(attempt - 1))).await;
            }
        }
    }
}

pub fn enqueue(notice: WorkNotice) {
    if let Some(sender) = NOTIFIER.get() {
        // 队列满时不阻塞业务线程：丢弃并留痕，避免把工作台写入卡在钉钉上。
        if let Err(error) = sender.try_send(notice) {
            tracing::warn!("钉钉工作通知队列已满或已关闭，丢弃一条通知：{error}");
        }
    }
}
