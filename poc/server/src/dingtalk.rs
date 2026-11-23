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
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

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
static NOTIFIER: OnceLock<UnboundedSender<WorkNotice>> = OnceLock::new();

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
        *guard = Some((token.clone(), Instant::now() + Duration::from_secs(ttl as u64 - 30)));
    }
    Ok(token)
}

fn http_client() -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| bad_gateway(format!("初始化钉钉 HTTP 客户端失败：{}", error.without_url())))
}

fn url_encode(value: &str) -> String {
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
            .json(&json!({ "dept_id": dept_id }))
            .send()
            .await
            .map_err(|error| bad_gateway(format!("钉钉部门列表请求失败：{}", error.without_url())))?;
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
    for dept_id in &departments {
        let mut cursor = 0i64;
        loop {
            let url = format!(
                "{}/topapi/v2/user/list?access_token={}",
                config.dingtalk_api_base,
                url_encode(&token)
            );
            let response = client
                .post(url)
                .json(&json!({ "dept_id": dept_id, "cursor": cursor, "size": 100 }))
                .send()
                .await
                .map_err(|error| bad_gateway(format!("钉钉成员列表请求失败：{}", error.without_url())))?;
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
            for raw in result.list {
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
                    department_ids: raw
                        .dept_id_list
                        .iter()
                        .map(|id| id.to_string())
                        .collect(),
                    active: raw.active,
                });
            }
            if !result.has_more || result.next_cursor <= cursor {
                break;
            }
            cursor = result.next_cursor;
        }
    }
    let mut users: Vec<OrgUser> = users.into_values().collect();
    users.sort_by(|a, b| a.userid.cmp(&b.userid));
    Ok((departments, users))
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
    let (tx, mut rx) = unbounded_channel::<WorkNotice>();
    if NOTIFIER.set(tx).is_err() {
        return;
    }
    tokio::spawn(async move {
        while let Some(notice) = rx.recv().await {
            if let Err(error) = send_work_notice(&config, &notice).await {
                tracing::warn!("钉钉工作通知发送失败：{}", error.message);
            }
        }
    });
}

pub fn enqueue(notice: WorkNotice) {
    if let Some(sender) = NOTIFIER.get() {
        let _ = sender.send(notice);
    }
}
