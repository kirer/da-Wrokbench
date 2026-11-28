use crate::api_admin::{admin_dingtalk_sync, admin_integrations, admin_update_user};
use crate::api_webhooks::gitlab_webhook;
use crate::clientip::ClientIp;
use crate::db::{self, Snapshot};
use crate::domain::{self, ApiError};
use crate::gitlab;
use crate::models::*;
use crate::store_ops::{
    events_since, lock_sqlite, mark_notifications_read, mutate, notifications_for, read_snapshot,
    unread_notifications,
};
use axum::extract::{FromRequestParts, Path, Query, State};
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct Config {
    pub auth_provider: String,
    pub auth_secret: String,
    pub internal_token: String,
    pub public_url: Option<String>,
    pub dingtalk_client_id: Option<String>,
    pub dingtalk_client_secret: Option<String>,
    pub dingtalk_agent_id: Option<String>,
    pub dingtalk_work_notify: bool,
    pub dingtalk_api_base: String,
    pub dingtalk_oauth_base: String,
    pub dingtalk_default_roles: Vec<String>,
    pub dingtalk_sync_root_dept: i64,
    pub dingtalk_disable_missing: bool,
    pub gitlab_base_url: Option<String>,
    pub gitlab_token: Option<String>,
    pub gitlab_webhook_secret: Option<String>,
    pub gitlab_default_branch: String,
    /// 分支命名模板，支持 {code} 与 {platform} 占位；默认 feature/{code}-{platform}。
    pub gitlab_branch_template: Option<String>,
    /// 是否启用发布门禁：冻结/发布前必须有验收标准且设计已交付。
    pub publish_gate: bool,
    pub token_ttl_seconds: i64,
    pub allow_remote_internal: bool,
}

#[derive(Clone)]
pub enum Store {
    Sqlite(Arc<Mutex<rusqlite::Connection>>),
    Postgres(crate::pg::Pool),
}

#[derive(Clone)]
pub struct AppState {
    pub store: Store,
    pub config: Arc<Config>,
    /// 已吊销的 JWT（jti -> 原过期时间戳）。退出登录后旧 token 立刻失效，
    /// 不再等到 TTL 自然过期。只在内存里，重启后失效——重启本身也让
    /// 未过期的 token 失去意义（客户端会重新登录）。
    pub revoked: Arc<Mutex<std::collections::HashMap<String, i64>>>,
    /// 简单的按 key 令牌桶，用于登录/Webhook 这类无鉴权入口。
    pub limiter: Arc<Mutex<std::collections::HashMap<String, RateBucket>>>,
    /// 进程级请求指标（/metrics 暴露），用于基础可观测性。
    pub metrics: Arc<crate::metrics::Metrics>,
}

/// 令牌桶：capacity 个令牌，每 refill_secs 秒补满一个。
#[derive(Clone, Copy)]
pub struct RateBucket {
    tokens: f64,
    last: i64,
    capacity: f64,
    refill_secs: f64,
}

impl RateBucket {
    fn new(capacity: f64, refill_secs: f64, now: i64) -> Self {
        Self {
            tokens: capacity,
            last: now,
            capacity,
            refill_secs,
        }
    }

    fn take(&mut self, now: i64) -> bool {
        let elapsed = (now - self.last).max(0) as f64;
        self.last = now;
        self.tokens = (self.tokens + elapsed / self.refill_secs).min(self.capacity);
        if self.tokens < 1.0 {
            return false;
        }
        self.tokens -= 1.0;
        true
    }

    fn refund(&mut self) {
        self.tokens = (self.tokens + 1.0).min(self.capacity);
    }
}

impl AppState {
    pub fn new_sqlite(conn: rusqlite::Connection, config: Config) -> Self {
        // 启动时把库里已吊销的 token 载入内存：重启后旧 token 仍然失效。
        let revoked_map = crate::db::load_revoked(&conn)
            .unwrap_or_default()
            .into_iter()
            .collect();
        Self {
            store: Store::Sqlite(Arc::new(Mutex::new(conn))),
            config: Arc::new(config),
            revoked: Arc::new(Mutex::new(revoked_map)),
            limiter: Arc::new(Mutex::new(std::collections::HashMap::new())),
            metrics: Arc::new(crate::metrics::Metrics::new()),
        }
    }

    pub fn new_postgres(pool: crate::pg::Pool, config: Config) -> Self {
        Self {
            store: Store::Postgres(pool),
            config: Arc::new(config),
            revoked: Arc::new(Mutex::new(std::collections::HashMap::new())),
            limiter: Arc::new(Mutex::new(std::collections::HashMap::new())),
            metrics: Arc::new(crate::metrics::Metrics::new()),
        }
    }

    /// 返回 false 表示超限。key 由调用方拼成「路由:来源」，不同入口互不影响。
    pub(crate) fn allow(&self, key: &str, capacity: f64, refill_secs: f64) -> bool {
        let now = unix_now();
        let mut buckets = match self.limiter.lock() {
            Ok(guard) => guard,
            Err(_) => return true, // 锁坏了也不能让登录彻底不可用
        };
        // 顺手清掉长期不用的 key，避免按 IP 无限增长。
        if buckets.len() > 4096 {
            buckets.retain(|_, bucket| now - bucket.last < 3600);
        }
        let bucket = buckets
            .entry(key.to_string())
            .or_insert_with(|| RateBucket::new(capacity, refill_secs, now));
        bucket.capacity = capacity;
        bucket.refill_secs = refill_secs;
        bucket.take(now)
    }

    /// 成功登录把预扣的令牌还回去：只有失败尝试才真正消耗配额。
    /// 本地部署时全员登录都经过宿主 BFF、来源都是 127.0.0.1，按「所有尝试」
    /// 计数会把正常使用也卡住；按失败计数既挡枚举，又不误伤日常登录。
    fn refund_auth_attempt(&self, key: &str) {
        if let Ok(mut buckets) = self.limiter.lock() {
            if let Some(bucket) = buckets.get_mut(key) {
                bucket.refund();
            }
        }
    }

    fn is_revoked(&self, jti: &str, now: i64) -> bool {
        let Ok(mut revoked) = self.revoked.lock() else {
            return false;
        };
        revoked.retain(|_, expires_at| *expires_at > now);
        revoked.contains_key(jti)
    }

    fn revoke(&self, jti: &str, expires_at: i64) {
        if jti.is_empty() {
            return;
        }
        if let Ok(mut revoked) = self.revoked.lock() {
            revoked.insert(jti.to_string(), expires_at);
        }
        // SQLite 落库：重启后旧 token 仍然失效（Postgres 多实例共享另需外部存储）。
        if let Store::Sqlite(db) = &self.store {
            if let Ok(conn) = db.lock() {
                if let Err(error) = crate::db::insert_revoked(&conn, jti, expires_at) {
                    tracing::warn!("吊销 token 落库失败：{error}");
                }
            }
        }
        // Postgres 也落库：后台异步写，重启后旧 token 仍失效。
        if let Store::Postgres(pool) = &self.store {
            let pool = pool.clone();
            let jti = jti.to_string();
            tokio::spawn(async move {
                let _ = crate::pg::insert_revoked(&pool, &jti, expires_at).await;
            });
        }
    }

    /// 启动时把已吊销 token 载入内存（Postgres 后端）。SQLite 在 new_sqlite 里已加载。
    pub async fn warm_revoked(&self) {
        if let Store::Postgres(pool) = &self.store {
            match crate::pg::load_revoked(pool).await {
                Ok(list) => {
                    if let Ok(mut map) = self.revoked.lock() {
                        for (jti, expires_at) in list {
                            map.insert(jti, expires_at);
                        }
                    }
                }
                Err(error) => tracing::warn!("加载已吊销 token 失败：{}", error.message),
            }
        }
    }
}

async fn find_user(state: &AppState, id: &str) -> Result<Option<User>, ApiError> {
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::find_user(&conn, id)?)
        }
        Store::Postgres(pool) => {
            let (_, snapshot) = crate::pg::load(pool, false).await?;
            Ok(snapshot.users.into_iter().find(|user| user.id == id))
        }
    }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    name: String,
    provider: String,
    iat: i64,
    exp: i64,
    /// 令牌唯一标识，退出登录时写进吊销集合。
    #[serde(default)]
    jti: String,
}

pub struct AuthUser(pub User);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let internal = parts
            .headers
            .get("x-workbench-internal-token")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if !internal.is_empty() && constant_time_eq(internal, &state.config.internal_token) {
            // 内部令牌是 host BFF 的机器凭据，不是浏览器凭据。默认只接受本机
            // 回环地址；跨机部署必须显式打开并配合网络隔离/mTLS。
            let peer = parts
                .extensions
                .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
                .map(|info| info.0);
            let loopback = peer
                .map(|addr| {
                    addr.ip().is_loopback()
                        || match addr.ip() {
                            std::net::IpAddr::V6(ip) => ip
                                .to_ipv4_mapped()
                                .map(|v4| v4.is_loopback())
                                .unwrap_or(false),
                            std::net::IpAddr::V4(_) => false,
                        }
                })
                .unwrap_or(false);
            if !loopback && !state.config.allow_remote_internal {
                return Err(ApiError::forbidden(
                    "内部调用只允许来自本机；跨机调用需显式配置 WORKBENCH_INTERNAL_ALLOW_REMOTE=1",
                ));
            }
            let actor = parts
                .headers
                .get("x-workbench-actor")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            if let Some(user) = find_user(state, actor).await? {
                if user.active {
                    return Ok(AuthUser(user));
                }
            }
            return Err(ApiError::unauthorized("内部调用身份无效"));
        }
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        let token = header.strip_prefix("Bearer ").unwrap_or_default();
        if token.is_empty() {
            return Err(ApiError::unauthorized("请先在工作台登录"));
        }
        let validation = Validation::new(Algorithm::HS256);
        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.auth_secret.as_bytes()),
            &validation,
        )
        .map_err(|_| ApiError::unauthorized("登录已过期，请重新登录"))?;
        if !data.claims.jti.is_empty() && state.is_revoked(&data.claims.jti, unix_now()) {
            return Err(ApiError::unauthorized("登录已失效，请重新登录"));
        }
        // 切换登录方式后，旧方式签发的令牌不能再当有效凭据用（两种方式共用同一个密钥）。
        if data.claims.provider != state.config.auth_provider {
            return Err(ApiError::unauthorized("登录方式已变更，请重新登录"));
        }
        let user = find_user(state, &data.claims.sub)
            .await?
            .filter(|user| user.active)
            .ok_or_else(|| ApiError::unauthorized("账号不存在或已停用"))?;
        Ok(AuthUser(user))
    }
}

pub(crate) fn constant_time_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut result = 0u8;
    for (a, b) in left.bytes().zip(right.bytes()) {
        result |= a ^ b;
    }
    result == 0
}

fn issue_token(config: &Config, user: &User) -> Result<(String, i64), ApiError> {
    let now = unix_now();
    let claims = Claims {
        sub: user.id.clone(),
        name: user.name.clone(),
        provider: config.auth_provider.clone(),
        iat: now,
        exp: now + config.token_ttl_seconds,
        jti: uuid::Uuid::new_v4().to_string(),
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.auth_secret.as_bytes()),
    )
    .map_err(|error| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("签发登录令牌失败：{error}"),
        )
    })?;
    Ok((token, config.token_ttl_seconds))
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or(0)
}

fn auth_payload(config: &Config, user: &User) -> Value {
    json!({
        "authenticated": true,
        "provider": config.auth_provider,
        "user": user.private_json(),
    })
}

async fn health(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let backend = match &state.store {
        Store::Sqlite(_) => "sqlite",
        Store::Postgres(_) => "postgres",
    };
    // 只做数据库连通性探测，不读取整份快照，避免健康检查随数据量放大开销。
    let probe: Result<(), ApiError> = match &state.store {
        Store::Sqlite(db) => db
            .lock()
            .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "服务端状态锁失效"))
            .and_then(|conn| {
                conn.query_row("SELECT 1", [], |_row| Ok(()))
                    .map_err(ApiError::from)
            }),
        Store::Postgres(pool) => crate::pg::ping(pool).await,
    };
    match probe {
        Ok(()) => (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "service": "dsh-workbench-server",
                "version": env!("CARGO_PKG_VERSION"),
                "provider": state.config.auth_provider,
                "database": backend,
                "serverTime": crate::now_iso(),
            })),
        ),
        Err(error) => {
            tracing::error!("health check failed: {}", error.message);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "ok": false,
                    "service": "dsh-workbench-server",
                    "database": backend,
                    "serverTime": crate::now_iso(),
                })),
            )
        }
    }
}

async fn auth_config(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let mock = if state.config.auth_provider == "mock" {
        Value::Array(
            snapshot
                .users
                .iter()
                .filter(|user| user.active)
                .map(|user| user.public_json())
                .collect(),
        )
    } else {
        Value::Null
    };
    Ok(Json(json!({
        "provider": state.config.auth_provider,
        "mock": if mock.is_null() { Value::Null } else { json!({ "users": mock }) },
        // clientId 是公开信息；AppSecret 只留在服务端，不返回。
        "dingtalk": if state.config.auth_provider == "dingtalk" {
            json!({ "clientId": state.config.dingtalk_client_id })
        } else {
            Value::Null
        },
    })))
}

#[derive(Debug, Deserialize)]
struct MockLogin {
    #[serde(rename = "userId")]
    user_id: String,
}

async fn auth_mock(
    State(state): State<AppState>,
    ip: ClientIp,
    Json(input): Json<MockLogin>,
) -> Result<Json<Value>, ApiError> {
    if state.config.auth_provider != "mock" {
        return Err(ApiError::not_found("Mock 登录未启用"));
    }
    // 登录入口按来源限流：60 次突发、每秒补 1 个（稳态 60 次/分）。
    // 不能太紧：本机部署时所有用户的登录都经过宿主 BFF，来源都是 127.0.0.1，
    // 8 人同时登录 + UAT 脚本重跑就会误伤；太松又等于没限。mock 登录没有密码，
    // 不限流就能被脚本枚举全部账号；钉钉交换同理（授权码可重放）。
    if !state.allow(&ip.key("auth"), 60.0, 1.0) {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "登录尝试过于频繁，请稍后再试",
        ));
    }
    let user = match find_user(&state, &input.user_id).await? {
        Some(user) if user.active => user,
        _ => {
            return Err(ApiError::unauthorized("Mock 用户不存在或已停用"));
        }
    };
    state.refund_auth_attempt(&ip.key("auth"));
    let (token, expires_in) = issue_token(&state.config, &user)?;
    let mut payload = auth_payload(&state.config, &user);
    payload["token"] = json!(token);
    payload["expiresIn"] = json!(expires_in);
    Ok(Json(payload))
}

/// 退出登录：把当前令牌的 jti 记进吊销集合。宿主 BFF 清 Cookie 后还要调这里，
/// 否则被复制的 token 在 TTL 内（默认 7 天）仍然能读到全部数据。
async fn auth_logout(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let header = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let token = header.strip_prefix("Bearer ").unwrap_or_default();
    if !token.is_empty() {
        if let Ok(data) = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.auth_secret.as_bytes()),
            &Validation::new(Algorithm::HS256),
        ) {
            state.revoke(&data.claims.jti, data.claims.exp);
        }
    }
    Ok(Json(json!({ "ok": true })))
}

async fn auth_session(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let mut payload = auth_payload(&state.config, &user);
    payload["platformGroups"] = json!(snapshot.groups);
    payload["platforms"] = json!(snapshot.platforms);
    payload["defaultBaseDir"] = json!("");
    Ok(Json(payload))
}

#[derive(Debug, Deserialize)]
struct DingTalkExchange {
    code: String,
}

#[derive(Debug, Deserialize)]
struct DingTalkTokenBody {
    #[serde(rename = "accessToken", default)]
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct DingTalkProfile {
    #[serde(rename = "unionId", default)]
    union_id: Option<String>,
    #[serde(rename = "openId", default)]
    open_id: Option<String>,
    #[serde(default)]
    mobile: Option<String>,
    #[serde(rename = "avatarUrl", default)]
    avatar_url: Option<String>,
}

async fn dingtalk_exchange(
    State(state): State<AppState>,
    ip: ClientIp,
    Json(input): Json<DingTalkExchange>,
) -> Result<Json<Value>, ApiError> {
    if state.config.auth_provider != "dingtalk" {
        return Err(ApiError::not_found("钉钉登录未启用"));
    }
    if !state.allow(&ip.key("auth"), 60.0, 1.0) {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "登录尝试过于频繁，请稍后再试",
        ));
    }
    let result = dingtalk_exchange_inner(&state, input).await;
    // 只有「凭证类失败」才真正消耗配额。上游 5xx / 网络错误不扣，否则一次钉钉
    // 故障就会把所有人锁在门外一分钟。
    let credential_failure = result
        .as_ref()
        .err()
        .map(|error| !error.status.is_server_error())
        .unwrap_or(false);
    if !credential_failure {
        state.refund_auth_attempt(&ip.key("auth"));
    }
    result
}

async fn dingtalk_exchange_inner(
    state: &AppState,
    input: DingTalkExchange,
) -> Result<Json<Value>, ApiError> {
    let client_id = state.config.dingtalk_client_id.clone().ok_or_else(|| {
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "缺少 DINGTALK_CLIENT_ID")
    })?;
    let client_secret = state.config.dingtalk_client_secret.clone().ok_or_else(|| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "缺少 DINGTALK_CLIENT_SECRET",
        )
    })?;
    if input.code.trim().is_empty() {
        return Err(ApiError::bad("缺少钉钉授权码"));
    }
    let client = crate::dingtalk::http_client()?;
    let token_response = client
        .post(format!(
            "{}/v1.0/oauth2/userAccessToken",
            state.config.dingtalk_oauth_base
        ))
        .json(&json!({
            "clientId": client_id,
            "clientSecret": client_secret,
            "code": input.code,
            "grantType": "authorization_code"
        }))
        .send()
        .await
        .map_err(|error| {
            ApiError::new(
                StatusCode::BAD_GATEWAY,
                format!("钉钉 token 请求失败：{error}"),
            )
        })?;
    if !token_response.status().is_success() {
        return Err(ApiError::unauthorized(format!(
            "钉钉换取 token 失败（{}）",
            token_response.status()
        )));
    }
    let token_body: DingTalkTokenBody = token_response.json().await.map_err(|error| {
        ApiError::new(
            StatusCode::BAD_GATEWAY,
            format!("钉钉 token 响应不合法：{error}"),
        )
    })?;
    if token_body.access_token.is_empty() {
        return Err(ApiError::unauthorized("钉钉没有返回 accessToken"));
    }
    let profile_response = client
        .get(format!(
            "{}/v1.0/contact/users/me",
            state.config.dingtalk_oauth_base
        ))
        .header("x-acs-dingtalk-access-token", &token_body.access_token)
        .send()
        .await
        .map_err(|error| {
            ApiError::new(
                StatusCode::BAD_GATEWAY,
                format!("读取钉钉用户失败：{error}"),
            )
        })?;
    if !profile_response.status().is_success() {
        return Err(ApiError::unauthorized(format!(
            "读取钉钉用户信息失败（{}）",
            profile_response.status()
        )));
    }
    let profile: DingTalkProfile = profile_response.json().await.map_err(|error| {
        ApiError::new(
            StatusCode::BAD_GATEWAY,
            format!("钉钉用户响应不合法：{error}"),
        )
    })?;
    let user = mutate(state, |snapshot| {
        let user = snapshot
            .users
            .iter_mut()
            .find(|user| {
                (profile.union_id.is_some() && user.dingtalk_union_id == profile.union_id)
                    || (profile.open_id.is_some() && user.dingtalk_open_id == profile.open_id)
                    || (profile.mobile.is_some() && user.mobile == profile.mobile)
            })
            .ok_or_else(|| ApiError::forbidden("你的钉钉账号还没有开通研发工作台，请联系管理员"))?;
        if !user.active {
            return Err(ApiError::forbidden("账号已停用"));
        }
        if profile.union_id.is_some() {
            user.dingtalk_union_id = profile.union_id.clone();
        }
        if profile.open_id.is_some() {
            user.dingtalk_open_id = profile.open_id.clone();
        }
        if profile.avatar_url.is_some() {
            user.avatar_url = profile.avatar_url.clone();
        }
        Ok(user.clone())
    })
    .await?;
    let (token, expires_in) = issue_token(&state.config, &user)?;
    let mut payload = auth_payload(&state.config, &user);
    payload["token"] = json!(token);
    payload["expiresIn"] = json!(expires_in);
    Ok(Json(payload))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OnboardingBody {
    #[serde(default)]
    active_role: Option<String>,
    #[serde(default)]
    platform_ids: Option<Vec<String>>,
    #[serde(default)]
    folder_configured: Option<bool>,
}

async fn onboarding_complete(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<OnboardingBody>,
) -> Result<Json<Value>, ApiError> {
    let user = mutate(&state, |snapshot| {
        domain::complete_onboarding(
            snapshot,
            &actor,
            domain::OnboardingInput {
                active_role: input.active_role,
                platform_ids: input.platform_ids,
                folder_configured: input.folder_configured,
            },
        )
    })
    .await?;
    Ok(Json(json!({
        "authenticated": true,
        "user": user.private_json(),
    })))
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExperienceBody {
    #[serde(default)]
    query: String,
    #[serde(default)]
    exclude: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

/// 只读：从现有需求/分工里聚合每个人的经历，并按一段需求描述找相似的历史需求。
async fn experience_report(
    State(state): State<AppState>,
    AuthUser(_actor): AuthUser,
    Json(input): Json<ExperienceBody>,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let query: String = input.query.chars().take(4000).collect();
    Ok(Json(crate::experience::report(
        &snapshot,
        query.trim(),
        input.exclude.as_deref().unwrap_or(""),
        input.limit.unwrap_or(5),
    )))
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

async fn get_state(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    headers: axum::http::HeaderMap,
) -> Result<axum::response::Response, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let etag = format!("\"{}\"", snapshot.revision);
    let all_notifications = notifications_for(&state, &actor.id, 500).await?;
    let unread = unread_notifications(&state, &actor.id).await?;
    let notification_groups = build_notification_groups(&snapshot, &all_notifications);
    let notifications: Vec<_> = all_notifications.into_iter().take(50).collect();
    let actor = snapshot
        .user(&actor.id)
        .cloned()
        .ok_or_else(|| ApiError::unauthorized("账号不存在"))?;
    let mut iterations = snapshot.iterations.clone();
    iterations.sort_by(|a, b| b.code.cmp(&a.code));
    let project = snapshot.active_project(&actor).cloned();
    let current = snapshot.active_iteration(&actor);
    let projects = snapshot
        .projects
        .iter()
        .filter(|project| !project.archived)
        .cloned()
        .collect::<Vec<_>>();
    // 草稿只回给创建人：未发布的需求不进别人的列表，也就不会露出产品是谁。
    let mut requirements = snapshot
        .requirements
        .iter()
        .filter(|requirement| domain::requirement_visible_to(requirement, &actor))
        .cloned()
        .collect::<Vec<_>>();
    requirements.sort_by(|a, b| a.code.cmp(&b.code));
    let payload = json!({
        "version": 5,
        "currentUser": actor.private_json(),
        "users": snapshot.users.iter().map(|user| user.public_json()).collect::<Vec<_>>(),
        "project": project,
        "projects": projects,
        "currentProjectId": project.as_ref().map(|project| project.id.clone()),
        "iteration": current,
        "iterations": iterations,
        "currentIterationId": current.map(|iteration| iteration.id.clone()),
        "platformGroups": snapshot.groups,
        "platforms": snapshot.platforms,
        "requirements": requirements,
        "notifications": notifications,
        "unreadNotificationCount": unread,
        "notificationGroups": notification_groups,
        "serverTime": crate::now_iso(),
        // 没接 GitLab 时 MR / 流水线是演示数据，前端据此把它标成“演示”，不做可点的真链接。
        "gitlabConfigured": gitlab::configured(&state.config),
    });
    // ETag = 全局修订号：内容没变时直接 304，省掉序列化和传输。
    let if_none_match = headers
        .get(axum::http::header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok());
    if if_none_match == Some(etag.as_str()) {
        return Ok((StatusCode::NOT_MODIFIED, [(axum::http::header::ETAG, etag)]).into_response());
    }
    Ok(([(axum::http::header::ETAG, etag)], Json(payload)).into_response())
}

async fn requirement_by_session(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(record_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let requirement = snapshot
        .requirements
        .iter()
        .find(|requirement| {
            domain::requirement_visible_to(requirement, &actor)
                && (requirement
                    .sessions
                    .iter()
                    .any(|session| session.id == record_id)
                    || requirement.primary_session_id.as_deref() == Some(record_id.as_str()))
        })
        .cloned();
    Ok(Json(json!({ "requirement": requirement })))
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

async fn create_project(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<domain::ProjectInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let project = mutate(&state, |snapshot| {
        domain::create_project(snapshot, &actor, input)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "project": project }))))
}

async fn update_project(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::ProjectInput>,
) -> Result<Json<Value>, ApiError> {
    let project = mutate(&state, |snapshot| {
        domain::update_project(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "project": project })))
}

async fn select_project(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let project = mutate(&state, |snapshot| {
        domain::select_project(snapshot, &actor, &id)
    })
    .await?;
    Ok(Json(json!({ "project": project })))
}

// ---------------------------------------------------------------------------
// Iterations
// ---------------------------------------------------------------------------

async fn create_iteration(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<domain::IterationInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let iteration = mutate(&state, |snapshot| {
        domain::create_iteration(snapshot, &actor, input)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "iteration": iteration }))))
}

async fn update_iteration(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::IterationInput>,
) -> Result<Json<Value>, ApiError> {
    let iteration = mutate(&state, |snapshot| {
        domain::update_iteration(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "iteration": iteration })))
}

async fn select_iteration(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let iteration = mutate(&state, |snapshot| {
        domain::select_iteration(snapshot, &actor, &id)
    })
    .await?;
    Ok(Json(json!({ "iteration": iteration })))
}

async fn archive_iteration(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let iteration = mutate(&state, |snapshot| {
        domain::archive_iteration(snapshot, &actor, &id, true)
    })
    .await?;
    Ok(Json(json!({ "iteration": iteration })))
}

async fn restore_iteration(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let iteration = mutate(&state, |snapshot| {
        domain::archive_iteration(snapshot, &actor, &id, false)
    })
    .await?;
    Ok(Json(json!({ "iteration": iteration })))
}

#[derive(Debug, Deserialize)]
struct MoveRequirementBody {
    requirement: String,
}

async fn move_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<MoveRequirementBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::move_requirement(snapshot, &actor, &input.requirement, &id)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct CreateRequirementBody {
    title: String,
}

async fn create_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<CreateRequirementBody>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let (requirement, iteration) = mutate(&state, |snapshot| {
        domain::create_requirement(snapshot, &actor, &input.title)
    })
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "requirement": requirement, "iteration": iteration })),
    ))
}

async fn delete_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::delete_requirement(snapshot, &actor, &id)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BindBody {
    #[serde(default)]
    session_record_id: Option<String>,
}

async fn bind_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<BindBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::bind_requirement(snapshot, &actor, &id, input.session_record_id.as_deref())
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

#[derive(Debug, Deserialize)]
struct CreateFailedBody {
    #[serde(default)]
    error: String,
}

async fn create_failed(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<CreateFailedBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::mark_create_failed(snapshot, &actor, &id, &input.error)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

#[derive(Debug, Deserialize)]
struct SessionBody {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    label: String,
}

async fn record_session(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<SessionBody>,
) -> Result<Json<Value>, ApiError> {
    let (requirement, session) = mutate(&state, |snapshot| {
        domain::record_session(snapshot, &actor, &id, &input.kind, &input.label)
    })
    .await?;
    Ok(Json(
        json!({ "requirement": requirement, "session": session }),
    ))
}

async fn archive_session(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path((id, record_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::archive_session(snapshot, &actor, &id, &record_id, true)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn restore_session(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path((id, record_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::archive_session(snapshot, &actor, &id, &record_id, false)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitBody {
    #[serde(default)]
    summary: Option<String>,
    /// 提交时固化的原型：宿主先把产品本机的 prototype/ 同步成附件，再把
    /// 当前每个屏的附件 ID 传上来。
    #[serde(default)]
    prototype: Vec<crate::models::PrototypeVersionFile>,
    /// 提交时确认的涉及端；省略表示不改。
    #[serde(default)]
    platform_ids: Option<Vec<String>>,
    /// 这条需求不需要设计交付时传 true；传 false 撤销「无需设计」。
    #[serde(default)]
    design_not_needed: Option<bool>,
    /// 提交时定下的分工（设计 / 各端开发 / 测试），都可省略。
    #[serde(default)]
    assignments: Option<domain::SubmitAssignments>,
}

async fn submit_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<SubmitBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::submit_requirement(
            snapshot,
            &actor,
            &id,
            input.summary.as_deref(),
            input.prototype,
            input.platform_ids,
            input.design_not_needed,
            input.assignments.unwrap_or_default(),
        )
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn review_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::ReviewInput>,
) -> Result<Json<Value>, ApiError> {
    let (requirement, review) = mutate(&state, |snapshot| {
        domain::review_requirement(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(
        json!({ "requirement": requirement, "review": review }),
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewersBody {
    user_ids: Vec<String>,
}

async fn set_reviewers(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<ReviewersBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::set_reviewers(snapshot, &actor, &id, input.user_ids)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn schedule_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::ScheduleInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::schedule_requirement(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn set_scope(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::ScopeInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::set_scope(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn design_claim(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::claim_design(snapshot, &actor, &id)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn design_reset(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::reset_design(snapshot, &actor, &id)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn design_deliver(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::DeliverDesignInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::deliver_design(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn update_requirement_document(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::DocumentInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::update_requirement_document(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn add_artifact(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::ArtifactInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let artifact = mutate(&state, |snapshot| {
        domain::add_artifact(snapshot, &actor, &id, input)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "artifact": artifact }))))
}

async fn get_artifact(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let artifact = domain::artifact_for(&snapshot, &actor, &id)?;
    let content = match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(&state)?;
            db::artifact_content(&conn, &id)?
        }
        Store::Postgres(pool) => {
            let (_, full) = crate::pg::load(pool, true).await?;
            full.artifact_contents
                .iter()
                .find(|item| item.id == id)
                .map(|item| item.content.clone())
        }
    }
    .ok_or_else(|| ApiError::not_found("附件内容不存在"))?;
    Ok(Json(json!({ "artifact": artifact, "content": content })))
}

async fn delete_artifact(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let deleted = mutate(&state, |snapshot| {
        domain::delete_artifact(snapshot, &actor, &id)
    })
    .await?;
    Ok(Json(json!({ "deleted": deleted })))
}

async fn dev_assign(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::DevAssignInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::dev_assign(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformActionBody {
    platform_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitlabRetryInput {
    platform_id: String,
    #[serde(default)]
    action: String,
}

async fn dev_claim(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<PlatformActionBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::dev_claim(snapshot, &actor, &id, &input.platform_id)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn dev_start(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<PlatformActionBody>,
) -> Result<Json<Value>, ApiError> {
    let platform_id = input.platform_id.clone();
    let requirement = mutate(&state, |snapshot| {
        domain::dev_start(snapshot, &actor, &id, &platform_id)
    })
    .await?;
    let mut integration_warning = Value::Null;
    if gitlab::configured(&state.config) {
        let snapshot = read_snapshot(&state).await?;
        if let Some(platform) = snapshot
            .platforms
            .iter()
            .find(|platform| platform.id == input.platform_id)
            .cloned()
        {
            let branch = gitlab::branch_name(&state.config, &requirement.code, &input.platform_id);
            let branch_result = match tokio::time::timeout(
                std::time::Duration::from_secs(15),
                gitlab::create_branch(&state.config, &platform, &branch),
            )
            .await
            {
                Ok(result) => result,
                Err(_) => Err(ApiError::new(
                    StatusCode::GATEWAY_TIMEOUT,
                    "GitLab 创建分支超时",
                )),
            };
            match branch_result {
                Ok(()) => {
                    mutate(&state, |snapshot| {
                        if let Some(index) = snapshot
                            .requirements
                            .iter()
                            .position(|item| item.id == requirement.id)
                        {
                            if let Some(task) =
                                snapshot.requirements[index].dev_task_mut(&input.platform_id)
                            {
                                task.branch = Some(branch.clone());
                                task.pipeline_status = Some("pending".to_string());
                            }
                            snapshot.push_event(
                                Some(&actor.id),
                                "integration.gitlab_branch",
                                Some(&requirement.id),
                                None,
                                json!({ "platformId": input.platform_id, "branch": branch }),
                            );
                        }
                        Ok(())
                    })
                    .await?;
                }
                Err(error) => {
                    // 上游原文只进服务端日志，不回传给客户端，也不写进任务备注。
                    tracing::warn!("GitLab 调用失败：{}", error.message);
                    integration_warning = json!("GitLab 同步失败，请联系负责人检查集成配置");
                }
            }
        }
    }
    let requirement = if integration_warning.is_null() {
        requirement
    } else {
        mutate(&state, |snapshot| {
            if let Some(index) = snapshot
                .requirements
                .iter()
                .position(|item| item.id == requirement.id)
            {
                if let Some(task) = snapshot.requirements[index].dev_task_mut(&input.platform_id) {
                    // 同一步骤只记一次提示，重试不会把备注越拼越长。
                    if !task.note.contains("GitLab 创建分支失败") {
                        task.note = format!("{} GitLab 创建分支失败", task.note.trim_end())
                            .trim()
                            .to_string();
                    }
                }
            }
            Ok(snapshot
                .requirements
                .iter()
                .find(|item| item.id == requirement.id)
                .cloned()
                .unwrap_or(requirement.clone()))
        })
        .await?
    };
    // GitLab 成功时分支 / MR / 流水线是在上面另一次 mutate 里写入的，
    // 手里的 requirement 还是调用前的克隆：返回前必须重新读一次。
    let requirement_id = requirement.id.clone();
    let requirement = read_snapshot(&state)
        .await?
        .requirements
        .into_iter()
        .find(|item| item.id == requirement_id)
        .unwrap_or(requirement);
    Ok(Json(json!({
        "requirement": requirement,
        "integrationWarning": integration_warning
    })))
}

/// 单个开发任务的 GitLab 手动重试：重新创建分支 / 补建 MR / 同步流水线。
async fn retry_gitlab(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<GitlabRetryInput>,
) -> Result<Json<Value>, ApiError> {
    if !gitlab::configured(&state.config) {
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "GitLab 未配置",
        ));
    }
    let snapshot = read_snapshot(&state).await?;
    let requirement = snapshot
        .requirements
        .iter()
        .find(|item| item.id == id || item.code == id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("需求不存在"))?;
    if !actor.can_plan() && requirement.owner_id != actor.id {
        return Err(ApiError::forbidden("没有权限重试该需求的 GitLab 集成"));
    }
    if !requirement
        .platform_ids
        .iter()
        .any(|platform| platform == &input.platform_id)
    {
        return Err(ApiError::bad("该平台不在需求范围内"));
    }
    let platform = snapshot
        .platforms
        .iter()
        .find(|platform| platform.id == input.platform_id)
        .cloned()
        .ok_or_else(|| ApiError::bad("平台不存在"))?;
    let existing_branch = requirement
        .dev_tasks
        .iter()
        .find(|task| task.platform_id == input.platform_id)
        .and_then(|task| task.branch.clone());
    let branch = existing_branch.unwrap_or_else(|| {
        gitlab::branch_name(&state.config, &requirement.code, &input.platform_id)
    });
    let action = if input.action.is_empty() {
        "branch".to_string()
    } else {
        input.action.to_lowercase()
    };
    match action.as_str() {
        "branch" => {
            gitlab::create_branch(&state.config, &platform, &branch).await?;
            mutate(&state, |snap| {
                if let Some(index) = snap
                    .requirements
                    .iter()
                    .position(|item| item.id == requirement.id)
                {
                    if let Some(task) = snap.requirements[index].dev_task_mut(&input.platform_id) {
                        task.branch = Some(branch.clone());
                        if task.pipeline_status.is_none() {
                            task.pipeline_status = Some("pending".to_string());
                        }
                    }
                    snap.push_event(
                        Some(&actor.id),
                        "integration.gitlab_branch",
                        Some(&requirement.id),
                        None,
                        json!({ "platformId": input.platform_id, "branch": branch }),
                    );
                }
                Ok(())
            })
            .await?;
            Ok(Json(json!({ "ok": true, "branch": branch })))
        }
        "mr" => {
            let title = format!("{} {}", requirement.code, requirement.title);
            let mr =
                gitlab::create_merge_request(&state.config, &platform, &branch, &title, "").await?;
            let url = mr.url.clone();
            mutate(&state, |snap| {
                if let Some(index) = snap
                    .requirements
                    .iter()
                    .position(|item| item.id == requirement.id)
                {
                    if let Some(task) = snap.requirements[index].dev_task_mut(&input.platform_id) {
                        task.mr_url = Some(url.clone());
                    }
                    snap.push_event(
                        Some(&actor.id),
                        "integration.gitlab_mr",
                        Some(&requirement.id),
                        None,
                        json!({ "platformId": input.platform_id, "url": url }),
                    );
                }
                Ok(())
            })
            .await?;
            Ok(Json(json!({ "ok": true, "mrUrl": url })))
        }
        "pipeline" => {
            let pipeline = gitlab::latest_pipeline(&state.config, &platform, &branch).await?;
            let (status, url) = match pipeline {
                Some(info) => (info.status, info.url),
                None => ("unknown".to_string(), None),
            };
            let saved_status = status.clone();
            let saved_url = url.clone();
            mutate(&state, move |snap| {
                if let Some(index) = snap
                    .requirements
                    .iter()
                    .position(|item| item.id == requirement.id)
                {
                    if let Some(task) = snap.requirements[index].dev_task_mut(&input.platform_id) {
                        task.pipeline_status = Some(saved_status);
                        task.pipeline_url = saved_url;
                    }
                }
                Ok(())
            })
            .await?;
            Ok(Json(json!({ "ok": true, "status": status, "url": url })))
        }
        other => Err(ApiError::bad(format!("不支持的重试动作：{other}"))),
    }
}

async fn dev_finish(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::DevFinishInput>,
) -> Result<Json<Value>, ApiError> {
    let platform_id = input.platform_id.clone();
    let note = input.note.clone();
    let mock_integration = !gitlab::configured(&state.config);
    let requirement = mutate(&state, |snapshot| {
        domain::dev_finish(snapshot, &actor, &id, input, mock_integration)
    })
    .await?;
    let mut integration_warning = Value::Null;
    if gitlab::configured(&state.config) {
        let snapshot = read_snapshot(&state).await?;
        if let Some(platform) = snapshot
            .platforms
            .iter()
            .find(|platform| platform.id == platform_id)
            .cloned()
        {
            let branch = requirement
                .dev_tasks
                .iter()
                .find(|task| task.platform_id == platform_id)
                .and_then(|task| task.branch.clone())
                .unwrap_or_else(|| {
                    gitlab::branch_name(&state.config, &requirement.code, &platform_id)
                });
            let title = format!("{} {}", requirement.code, requirement.title);
            let description = if note.trim().is_empty() {
                format!("{} / {}", requirement.code, platform_id)
            } else {
                note
            };
            let mr_result = match tokio::time::timeout(
                std::time::Duration::from_secs(15),
                gitlab::create_merge_request(
                    &state.config,
                    &platform,
                    &branch,
                    &title,
                    &description,
                ),
            )
            .await
            {
                Ok(result) => result,
                Err(_) => Err(ApiError::new(
                    StatusCode::GATEWAY_TIMEOUT,
                    "GitLab 创建 MR 超时",
                )),
            };
            match mr_result {
                Ok(mr) => {
                    let pipeline = tokio::time::timeout(
                        std::time::Duration::from_secs(8),
                        gitlab::latest_pipeline(&state.config, &platform, &branch),
                    )
                    .await
                    .ok()
                    .and_then(|res| res.ok())
                    .flatten();
                    mutate(&state, |snapshot| {
                        if let Some(index) = snapshot
                            .requirements
                            .iter()
                            .position(|item| item.id == requirement.id)
                        {
                            if let Some(task) =
                                snapshot.requirements[index].dev_task_mut(&platform_id)
                            {
                                task.branch = Some(branch.clone());
                                task.mr_url = Some(mr.url.clone());
                                if let Some(pipeline) = &pipeline {
                                    task.pipeline_status = Some(pipeline.status.clone());
                                    task.pipeline_url = pipeline.url.clone();
                                } else {
                                    task.pipeline_status = Some("pending".to_string());
                                }
                            }
                            snapshot.push_event(
                                Some(&actor.id),
                                "integration.gitlab_mr",
                                Some(&requirement.id),
                                None,
                                json!({
                                    "platformId": platform_id,
                                    "mrUrl": mr.url,
                                    "iid": mr.iid
                                }),
                            );
                        }
                        Ok(())
                    })
                    .await?;
                }
                Err(error) => {
                    // 上游原文只进服务端日志，不回传给客户端，也不写进任务备注。
                    tracing::warn!("GitLab 调用失败：{}", error.message);
                    integration_warning = json!("GitLab 同步失败，请联系负责人检查集成配置");
                }
            }
        }
    }
    let requirement = if integration_warning.is_null() {
        requirement
    } else {
        mutate(&state, |snapshot| {
            if let Some(index) = snapshot
                .requirements
                .iter()
                .position(|item| item.id == requirement.id)
            {
                if let Some(task) = snapshot.requirements[index].dev_task_mut(&platform_id) {
                    // 同一步骤只记一次提示，重试不会把备注越拼越长。
                    if !task.note.contains("GitLab 创建合并请求失败") {
                        task.note = format!("{} GitLab 创建合并请求失败", task.note.trim_end())
                            .trim()
                            .to_string();
                    }
                }
            }
            Ok(snapshot
                .requirements
                .iter()
                .find(|item| item.id == requirement.id)
                .cloned()
                .unwrap_or(requirement.clone()))
        })
        .await?
    };
    // GitLab 成功时分支 / MR / 流水线是在上面另一次 mutate 里写入的，
    // 手里的 requirement 还是调用前的克隆：返回前必须重新读一次。
    let requirement_id = requirement.id.clone();
    let requirement = read_snapshot(&state)
        .await?
        .requirements
        .into_iter()
        .find(|item| item.id == requirement_id)
        .unwrap_or(requirement);
    Ok(Json(json!({
        "requirement": requirement,
        "integrationWarning": integration_warning
    })))
}

async fn dev_reopen(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<PlatformActionBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::dev_reopen(snapshot, &actor, &id, &input.platform_id)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn test_claim(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| domain::claim_test(snapshot, &actor, &id)).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn test_start(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| domain::test_start(snapshot, &actor, &id)).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn test_pass(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::TestResultInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::test_pass(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn test_fail(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::TestResultInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::test_fail(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn freeze(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    if state.config.publish_gate {
        let snapshot = read_snapshot(&state).await?;
        if let Some(item) = snapshot
            .requirements
            .iter()
            .find(|item| item.id == id || item.code == id)
        {
            domain::enforce_publish_gate(item)?;
        }
    }
    let requirement = mutate(&state, |snapshot| domain::freeze(snapshot, &actor, &id)).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn unfreeze(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| domain::unfreeze(snapshot, &actor, &id)).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn release(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::ReleaseInput>,
) -> Result<Json<Value>, ApiError> {
    if state.config.publish_gate {
        let snapshot = read_snapshot(&state).await?;
        if let Some(item) = snapshot
            .requirements
            .iter()
            .find(|item| item.id == id || item.code == id)
        {
            domain::enforce_publish_gate(item)?;
        }
    }
    let requirement = mutate(&state, |snapshot| {
        domain::release(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

/// 发布后验收完成：released -> done。
async fn complete_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::complete_requirement(snapshot, &actor, &id)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

/// 废弃需求：任何未完成/未取消的需求都可以取消，进入「已取消」并移出本期。
async fn cancel_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::cancel_requirement(snapshot, &actor, &id)
    })
    .await?;
    Ok(Json(json!({ "requirement": requirement })))
}

/// 跨项目人员负载总览（只读）。
async fn global_overview(
    State(state): State<AppState>,
    AuthUser(_actor): AuthUser,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    Ok(Json(
        json!({ "overview": domain::global_overview(&snapshot) }),
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionDiffQuery {
    from: u32,
    to: u32,
}

/// 两个提交版本之间的差异（只读）。
async fn version_diff(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Query(query): Query<VersionDiffQuery>,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let diff = domain::version_diff(&snapshot, &id, &actor, query.from, query.to)?;
    Ok(Json(json!({ "diff": diff })))
}

// ---------------------------------------------------------------------------
// Platform configuration
// ---------------------------------------------------------------------------

async fn create_platform_group(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<domain::PlatformGroupInput>,
) -> Result<Json<Value>, ApiError> {
    let item = mutate(&state, |snapshot| {
        domain::create_platform_group(snapshot, &actor, input)
    })
    .await?;
    let snapshot = read_snapshot(&state).await?;
    Ok(Json(json!({
        "item": item,
        "platformGroups": snapshot.groups,
        "platforms": snapshot.platforms
    })))
}

async fn update_platform_group(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::PlatformGroupInput>,
) -> Result<Json<Value>, ApiError> {
    let item = mutate(&state, |snapshot| {
        domain::update_platform_group(snapshot, &actor, &id, input)
    })
    .await?;
    let snapshot = read_snapshot(&state).await?;
    Ok(Json(json!({
        "item": item,
        "platformGroups": snapshot.groups,
        "platforms": snapshot.platforms
    })))
}

async fn archive_platform_group(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path((id, action)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    if action != "archive" && action != "restore" {
        return Err(ApiError::bad("action 只能是 archive 或 restore"));
    }
    mutate(&state, |snapshot| {
        domain::archive_platform(
            snapshot,
            &actor,
            "platform-groups",
            &id,
            action == "restore",
        )
    })
    .await?;
    let snapshot = read_snapshot(&state).await?;
    Ok(Json(json!({
        "platformGroups": snapshot.groups,
        "platforms": snapshot.platforms
    })))
}

async fn create_platform(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<domain::PlatformInput>,
) -> Result<Json<Value>, ApiError> {
    let item = mutate(&state, |snapshot| {
        domain::create_platform(snapshot, &actor, input)
    })
    .await?;
    let snapshot = read_snapshot(&state).await?;
    Ok(Json(json!({
        "item": item,
        "platformGroups": snapshot.groups,
        "platforms": snapshot.platforms
    })))
}

async fn update_platform(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::PlatformInput>,
) -> Result<Json<Value>, ApiError> {
    let item = mutate(&state, |snapshot| {
        domain::update_platform(snapshot, &actor, &id, input)
    })
    .await?;
    let snapshot = read_snapshot(&state).await?;
    Ok(Json(json!({
        "item": item,
        "platformGroups": snapshot.groups,
        "platforms": snapshot.platforms
    })))
}

async fn archive_platform(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path((id, action)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    if action != "archive" && action != "restore" {
        return Err(ApiError::bad("action 只能是 archive 或 restore"));
    }
    mutate(&state, |snapshot| {
        domain::archive_platform(snapshot, &actor, "platforms", &id, action == "restore")
    })
    .await?;
    let snapshot = read_snapshot(&state).await?;
    Ok(Json(json!({
        "platformGroups": snapshot.groups,
        "platforms": snapshot.platforms
    })))
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

async fn list_skills(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let mut skills: Vec<Skill> = snapshot
        .skills
        .into_iter()
        .filter(|skill| actor.can_plan() || skill.scope == "global" || skill.owner_id == actor.id)
        // 别人还没通过审核的版本不能带正文下发：未审核内容不应对其他成员可见。
        .map(|mut skill| {
            if actor.can_plan() || skill.owner_id == actor.id {
                return skill;
            }
            skill
                .versions
                .retain(|version| version.decision.as_deref() == Some("approved"));
            skill
        })
        .collect();
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(json!({ "skills": skills })))
}

async fn published_skills(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let items: Vec<Value> = snapshot
        .skills
        .iter()
        .filter(|skill| {
            skill.published()
                && (actor.can_plan() || skill.scope == "global" || skill.owner_id == actor.id)
        })
        .filter_map(|skill| {
            let latest = skill.latest()?;
            Some(json!({
                "id": skill.id,
                "name": skill.name,
                "description": skill.description,
                "rolePacks": skill.role_packs,
                "scope": skill.scope,
                "version": latest.version,
                "content": latest.content,
            }))
        })
        .collect();
    Ok(Json(json!({ "skills": items })))
}

async fn create_skill(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<domain::SkillInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let skill = mutate(&state, |snapshot| {
        domain::create_skill(snapshot, &actor, input)
    })
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "skill": skill }))))
}

async fn update_skill(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::SkillUpdateInput>,
) -> Result<Json<Value>, ApiError> {
    let skill = mutate(&state, |snapshot| {
        domain::update_skill(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "skill": skill })))
}

async fn add_skill_version(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::SkillVersionInput>,
) -> Result<Json<Value>, ApiError> {
    let skill = mutate(&state, |snapshot| {
        domain::add_skill_version(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "skill": skill })))
}

async fn review_skill(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::SkillReviewInput>,
) -> Result<Json<Value>, ApiError> {
    let skill = mutate(&state, |snapshot| {
        domain::review_skill(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "skill": skill })))
}

async fn skill_use(
    State(state): State<AppState>,
    AuthUser(_actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let skill = mutate(&state, |snapshot| domain::record_skill_use(snapshot, &id)).await?;
    Ok(Json(json!({ "skill": skill })))
}

async fn skill_projects(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::SkillProjectsInput>,
) -> Result<Json<Value>, ApiError> {
    let skill = mutate(&state, |snapshot| {
        domain::set_skill_projects(snapshot, &actor, &id, input)
    })
    .await?;
    Ok(Json(json!({ "skill": skill })))
}

// ---------------------------------------------------------------------------
// Notifications / events
// ---------------------------------------------------------------------------

async fn list_notifications(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
) -> Result<Json<Value>, ApiError> {
    let all_notifications = notifications_for(&state, &actor.id, 500).await?;
    let snapshot = read_snapshot(&state).await?;
    let unread = unread_notifications(&state, &actor.id).await?;
    let groups = build_notification_groups(&snapshot, &all_notifications);
    let items: Vec<_> = all_notifications.into_iter().take(100).collect();
    Ok(Json(json!({
        "notifications": items,
        "unreadNotificationCount": unread,
        "notificationGroups": groups
    })))
}

/// 按需求聚合通知，供客户端做「全部 / 某个需求」筛选。未绑定需求的通知
/// 归入 `system` 组。
fn build_notification_groups(snapshot: &Snapshot, items: &[Notification]) -> Vec<Value> {
    struct Group {
        key: String,
        requirement_id: Option<String>,
        code: String,
        title: String,
        total: i64,
        unread: i64,
        latest_at: String,
        latest_title: String,
    }
    let mut groups: Vec<Group> = Vec::new();
    for item in items {
        let key = item
            .requirement_id
            .clone()
            .unwrap_or_else(|| "system".to_string());
        let index = if let Some(index) = groups.iter().position(|group| group.key == key) {
            index
        } else {
            let requirement = item
                .requirement_id
                .as_deref()
                .and_then(|id| snapshot.requirements.iter().find(|req| req.id == id));
            groups.push(Group {
                key,
                requirement_id: item.requirement_id.clone(),
                code: requirement.map(|req| req.code.clone()).unwrap_or_default(),
                title: requirement
                    .map(|req| req.title.clone())
                    .unwrap_or_else(|| "系统".to_string()),
                total: 0,
                unread: 0,
                latest_at: item.at.clone(),
                latest_title: item.title.clone(),
            });
            groups.len() - 1
        };
        let group = &mut groups[index];
        group.total += 1;
        if !item.read {
            group.unread += 1;
        }
        if item.at > group.latest_at {
            group.latest_at = item.at.clone();
            group.latest_title = item.title.clone();
        }
    }
    groups.sort_by(|a, b| {
        b.unread
            .cmp(&a.unread)
            .then_with(|| b.latest_at.cmp(&a.latest_at))
    });
    groups
        .into_iter()
        .map(|group| {
            json!({
                "key": group.key,
                "requirementId": group.requirement_id,
                "code": group.code,
                "title": group.title,
                "total": group.total,
                "unread": group.unread,
                "latestAt": group.latest_at,
                "latestTitle": group.latest_title,
            })
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct ReadNotificationsBody {
    #[serde(default)]
    ids: Option<Vec<i64>>,
}

async fn read_notifications(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<ReadNotificationsBody>,
) -> Result<Json<Value>, ApiError> {
    if input.ids.as_ref().is_some_and(|ids| ids.len() > 200) {
        return Err(ApiError::bad("一次最多标记 200 条通知为已读"));
    }
    mark_notifications_read(&state, &actor.id, input.ids.as_deref()).await?;
    let unread = unread_notifications(&state, &actor.id).await?;
    Ok(Json(
        json!({ "ok": true, "unreadNotificationCount": unread }),
    ))
}

#[derive(Debug, Deserialize)]
struct EventsQuery {
    #[serde(default)]
    since: Option<i64>,
    #[serde(default)]
    limit: Option<usize>,
}

async fn list_events(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Query(query): Query<EventsQuery>,
) -> Result<Json<Value>, ApiError> {
    let mut items = events_since(
        &state,
        query.since.unwrap_or(0),
        query.limit.unwrap_or(100).clamp(1, 500),
    )
    .await?;
    // 普通成员看到的是业务事件流；管理员/集成/技能审核的载荷只给管理员，
    // 否则 /events 等于绕过 /audit 的权限检查。
    if !actor.has_role(ROLE_ADMIN) {
        items.retain(|event| {
            !event.kind.starts_with("admin.")
                && !event.kind.starts_with("integration.")
                && !event.kind.starts_with("skill.")
        });
    }
    Ok(Json(json!({ "events": items })))
}

/// SSE 事件流：把新事件实时推给客户端，替代高频轮询。非管理员过滤敏感事件。
async fn events_stream(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Query(query): Query<EventsQuery>,
) -> axum::response::sse::Sse<
    impl futures::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>,
> {
    use axum::response::sse::{Event, KeepAlive, Sse};
    let start = query.since.unwrap_or(0);
    let is_admin = actor.has_role(ROLE_ADMIN);
    let state = state.clone();
    let stream = futures::stream::unfold(start, move |cursor| {
        let state = state.clone();
        async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            match events_since(&state, cursor, 200).await {
                Ok(mut items) if !items.is_empty() => {
                    if !is_admin {
                        items.retain(|event| {
                            !event.kind.starts_with("admin.")
                                && !event.kind.starts_with("integration.")
                                && !event.kind.starts_with("skill.")
                        });
                    }
                    if items.is_empty() {
                        return Some((Ok(Event::default().comment("ping")), cursor));
                    }
                    let last = items.last().map(|event| event.id).unwrap_or(cursor);
                    let data = serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string());
                    Some((Ok(Event::default().event("workbench").data(data)), last))
                }
                _ => Some((Ok(Event::default().comment("ping")), cursor)),
            }
        }
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn list_audit(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Query(query): Query<EventsQuery>,
) -> Result<Json<Value>, ApiError> {
    if !actor.has_role(ROLE_ADMIN) {
        return Err(ApiError::forbidden("只有管理员可以查看审计日志"));
    }
    let items = events_since(
        &state,
        query.since.unwrap_or(0),
        query.limit.unwrap_or(200).clamp(1, 1000),
    )
    .await?;
    Ok(Json(json!({ "events": items })))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(crate::metrics::scrape))
        .route("/auth/config", get(auth_config))
        .route("/auth/mock", post(auth_mock))
        .route("/auth/dingtalk/exchange", post(dingtalk_exchange))
        .route("/auth/session", get(auth_session))
        .route("/auth/logout", post(auth_logout))
        .route("/onboarding/complete", post(onboarding_complete))
        .route("/state", get(get_state))
        .route("/overview", get(global_overview))
        .route("/experience", post(experience_report))
        .route("/projects", post(create_project))
        .route("/projects/{id}", post(update_project))
        .route("/projects/{id}/select", post(select_project))
        .route("/iterations", post(create_iteration))
        .route("/iterations/{id}", post(update_iteration))
        .route("/iterations/{id}/select", post(select_iteration))
        .route("/iterations/{id}/archive", post(archive_iteration))
        .route("/iterations/{id}/restore", post(restore_iteration))
        .route("/iterations/{id}/move-requirement", post(move_requirement))
        .route("/requirements", post(create_requirement))
        .route("/requirements/{id}", delete(delete_requirement))
        .route(
            "/requirements/by-session/{record_id}",
            get(requirement_by_session),
        )
        .route("/requirements/{id}/bind", post(bind_requirement))
        .route("/requirements/{id}/create-failed", post(create_failed))
        .route("/requirements/{id}/sessions", post(record_session))
        .route(
            "/requirements/{id}/sessions/{record_id}/archive",
            post(archive_session),
        )
        .route(
            "/requirements/{id}/sessions/{record_id}/restore",
            post(restore_session),
        )
        .route("/requirements/{id}/submit", post(submit_requirement))
        .route("/requirements/{id}/review", post(review_requirement))
        .route("/requirements/{id}/reviewers", post(set_reviewers))
        .route("/requirements/{id}/schedule", post(schedule_requirement))
        .route("/requirements/{id}/scope", post(set_scope))
        .route("/requirements/{id}/design-claim", post(design_claim))
        .route("/requirements/{id}/design-reset", post(design_reset))
        .route("/requirements/{id}/design-deliver", post(design_deliver))
        .route(
            "/requirements/{id}/document",
            post(update_requirement_document),
        )
        .route("/requirements/{id}/artifacts", post(add_artifact))
        .route("/artifacts/{id}", get(get_artifact).delete(delete_artifact))
        .route("/requirements/{id}/dev-assign", post(dev_assign))
        .route("/requirements/{id}/dev-claim", post(dev_claim))
        .route("/requirements/{id}/dev-start", post(dev_start))
        .route("/requirements/{id}/dev-finish", post(dev_finish))
        .route("/requirements/{id}/dev-reopen", post(dev_reopen))
        .route("/requirements/{id}/gitlab-retry", post(retry_gitlab))
        .route("/requirements/{id}/test-claim", post(test_claim))
        .route("/requirements/{id}/test-start", post(test_start))
        .route("/requirements/{id}/test-pass", post(test_pass))
        .route("/requirements/{id}/test-fail", post(test_fail))
        .route("/requirements/{id}/freeze", post(freeze))
        .route("/requirements/{id}/unfreeze", post(unfreeze))
        .route("/requirements/{id}/release", post(release))
        .route("/requirements/{id}/complete", post(complete_requirement))
        .route("/requirements/{id}/cancel", post(cancel_requirement))
        .route("/requirements/{id}/versions/diff", get(version_diff))
        .route("/platform-groups", post(create_platform_group))
        .route("/platform-groups/{id}", post(update_platform_group))
        .route(
            "/platform-groups/{id}/{action}",
            post(archive_platform_group),
        )
        .route("/platforms", post(create_platform))
        .route("/platforms/{id}", post(update_platform))
        .route("/platforms/{id}/{action}", post(archive_platform))
        .route("/skills", get(list_skills).post(create_skill))
        .route("/skills/published", get(published_skills))
        .route("/skills/{id}", post(update_skill))
        .route("/skills/{id}/versions", post(add_skill_version))
        .route("/skills/{id}/review", post(review_skill))
        .route("/skills/{id}/use", post(skill_use))
        .route("/skills/{id}/projects", post(skill_projects))
        .route("/notifications", get(list_notifications))
        .route("/notifications/read", post(read_notifications))
        .route("/events", get(list_events))
        .route("/events/stream", get(events_stream))
        .route("/audit", get(list_audit))
        .route("/admin/users/{id}", post(admin_update_user))
        .route("/admin/dingtalk/sync", post(admin_dingtalk_sync))
        .route("/admin/integrations", get(admin_integrations))
        .route("/webhooks/gitlab", post(gitlab_webhook))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::metrics::track_metrics,
        ))
        .with_state(state)
}
