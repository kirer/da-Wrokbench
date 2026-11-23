use crate::db::{self, Snapshot};
use crate::domain::{self, ApiError};
use crate::gitlab;
use crate::models::*;
use axum::extract::{FromRequestParts, Path, Query, State};
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
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
}

impl AppState {
    pub fn new_sqlite(conn: rusqlite::Connection, config: Config) -> Self {
        Self {
            store: Store::Sqlite(Arc::new(Mutex::new(conn))),
            config: Arc::new(config),
        }
    }

    pub fn new_postgres(pool: crate::pg::Pool, config: Config) -> Self {
        Self {
            store: Store::Postgres(pool),
            config: Arc::new(config),
        }
    }
}

fn lock_sqlite(
    state: &AppState,
) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, ApiError> {
    match &state.store {
        Store::Sqlite(db) => db
            .lock()
            .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "服务端状态锁失效")),
        Store::Postgres(_) => Err(ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "服务端配置错误：Postgres 后端不能使用 SQLite 连接",
        )),
    }
}

async fn read_snapshot(state: &AppState) -> Result<Snapshot, ApiError> {
    match &state.store {
        Store::Sqlite(db) => {
            let conn = db
                .lock()
                .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "服务端状态锁失效"))?;
            Ok(db::load_snapshot(&conn)?)
        }
        Store::Postgres(pool) => {
            let (_, snapshot) = crate::pg::load(pool).await?;
            Ok(snapshot)
        }
    }
}

async fn mutate<T, F>(state: &AppState, action: F) -> Result<T, ApiError>
where
    T: Send,
    F: FnOnce(&mut Snapshot) -> Result<T, ApiError> + Send,
{
    match &state.store {
        Store::Sqlite(db) => {
            let mut conn = db
                .lock()
                .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "服务端状态锁失效"))?;
            let mut snapshot = db::load_snapshot(&conn)?;
            let result = action(&mut snapshot)?;
            let tx = conn.transaction()?;
            db::save_snapshot(&tx, &mut snapshot)?;
            tx.commit()?;
            Ok(result)
        }
        Store::Postgres(pool) => crate::pg::mutate(pool, action).await,
    }
}

async fn find_user(state: &AppState, id: &str) -> Result<Option<User>, ApiError> {
    let snapshot = read_snapshot(state).await?;
    Ok(snapshot.users.into_iter().find(|user| user.id == id))
}

async fn notifications_for(
    state: &AppState,
    user_id: &str,
    limit: usize,
) -> Result<Vec<Notification>, ApiError> {
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::notifications_for(&conn, user_id, limit)?)
        }
        Store::Postgres(pool) => crate::pg::notifications_for(pool, user_id, limit).await,
    }
}

async fn unread_notifications(state: &AppState, user_id: &str) -> Result<i64, ApiError> {
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::unread_notifications(&conn, user_id)?)
        }
        Store::Postgres(pool) => crate::pg::unread_notifications(pool, user_id).await,
    }
}

async fn mark_notifications_read(
    state: &AppState,
    user_id: &str,
    ids: Option<&[i64]>,
) -> Result<(), ApiError> {
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::mark_notifications_read(&conn, user_id, ids)?)
        }
        Store::Postgres(pool) => crate::pg::mark_notifications_read(pool, user_id, ids).await,
    }
}

async fn events_since(state: &AppState, since: i64, limit: usize) -> Result<Vec<Event>, ApiError> {
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::events_since(&conn, since, limit)?)
        }
        Store::Postgres(pool) => crate::pg::events_since(pool, since, limit).await,
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
                            std::net::IpAddr::V6(ip) => {
                                ip.to_ipv4_mapped().map(|v4| v4.is_loopback()).unwrap_or(false)
                            }
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
    Json(input): Json<MockLogin>,
) -> Result<Json<Value>, ApiError> {
    if state.config.auth_provider != "mock" {
        return Err(ApiError::not_found("Mock 登录未启用"));
    }
    let user = find_user(&state, &input.user_id)
        .await?
        .filter(|user| user.active)
        .ok_or_else(|| ApiError::unauthorized("Mock 用户不存在或已停用"))?;
    let (token, expires_in) = issue_token(&state.config, &user)?;
    let mut payload = auth_payload(&state.config, &user);
    payload["token"] = json!(token);
    payload["expiresIn"] = json!(expires_in);
    Ok(Json(payload))
}

async fn auth_session(State(state): State<AppState>, AuthUser(user): AuthUser) -> Result<Json<Value>, ApiError> {
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
    Json(input): Json<DingTalkExchange>,
) -> Result<Json<Value>, ApiError> {
    if state.config.auth_provider != "dingtalk" {
        return Err(ApiError::not_found("钉钉登录未启用"));
    }
    let client_id = state
        .config
        .dingtalk_client_id
        .clone()
        .ok_or_else(|| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "缺少 DINGTALK_CLIENT_ID"))?;
    let client_secret = state
        .config
        .dingtalk_client_secret
        .clone()
        .ok_or_else(|| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "缺少 DINGTALK_CLIENT_SECRET"))?;
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
        .map_err(|error| ApiError::new(StatusCode::BAD_GATEWAY, format!("钉钉 token 请求失败：{error}")))?;
    if !token_response.status().is_success() {
        return Err(ApiError::unauthorized(format!(
            "钉钉换取 token 失败（{}）",
            token_response.status()
        )));
    }
    let token_body: DingTalkTokenBody = token_response.json().await.map_err(|error| {
        ApiError::new(StatusCode::BAD_GATEWAY, format!("钉钉 token 响应不合法：{error}"))
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
        .map_err(|error| ApiError::new(StatusCode::BAD_GATEWAY, format!("读取钉钉用户失败：{error}")))?;
    if !profile_response.status().is_success() {
        return Err(ApiError::unauthorized(format!(
            "读取钉钉用户信息失败（{}）",
            profile_response.status()
        )));
    }
    let profile: DingTalkProfile = profile_response.json().await.map_err(|error| {
        ApiError::new(StatusCode::BAD_GATEWAY, format!("钉钉用户响应不合法：{error}"))
    })?;
    let user = mutate(&state, |snapshot| {
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
    }).await?;
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
    }).await?;
    Ok(Json(json!({
        "authenticated": true,
        "user": user.private_json(),
    })))
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

async fn get_state(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let notifications = notifications_for(&state, &actor.id, 50).await?;
    let unread = unread_notifications(&state, &actor.id).await?;
    let notification_groups = notification_groups(&state, &actor.id).await?;
    let actor = snapshot
        .user(&actor.id)
        .cloned()
        .ok_or_else(|| ApiError::unauthorized("账号不存在"))?;
    let mut iterations = snapshot.iterations.clone();
    iterations.sort_by(|a, b| b.code.cmp(&a.code));
    let current = snapshot
        .iterations
        .iter()
        .find(|iteration| {
            Some(&iteration.id) == actor.current_iteration_id.as_ref() && !iteration.archived
        })
        .or_else(|| snapshot.iterations.iter().find(|iteration| !iteration.archived))
        .or_else(|| snapshot.iterations.first());
    let mut requirements = snapshot.requirements.clone();
    requirements.sort_by(|a, b| a.code.cmp(&b.code));
    Ok(Json(json!({
        "version": 4,
        "currentUser": actor.private_json(),
        "users": snapshot.users.iter().map(|user| user.public_json()).collect::<Vec<_>>(),
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
    })))
}

async fn requirement_by_session(
    State(state): State<AppState>,
    AuthUser(_actor): AuthUser,
    Path(record_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let requirement = snapshot
        .requirements
        .iter()
        .find(|requirement| {
            requirement
                .sessions
                .iter()
                .any(|session| session.id == record_id)
                || requirement.primary_session_id.as_deref() == Some(record_id.as_str())
        })
        .cloned();
    Ok(Json(json!({ "requirement": requirement })))
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
    }).await?;
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
    }).await?;
    Ok(Json(json!({ "iteration": iteration })))
}

async fn select_iteration(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let iteration = mutate(&state, |snapshot| {
        domain::select_iteration(snapshot, &actor, &id)
    }).await?;
    Ok(Json(json!({ "iteration": iteration })))
}

async fn archive_iteration(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let iteration = mutate(&state, |snapshot| {
        domain::archive_iteration(snapshot, &actor, &id, true)
    }).await?;
    Ok(Json(json!({ "iteration": iteration })))
}

async fn restore_iteration(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let iteration = mutate(&state, |snapshot| {
        domain::archive_iteration(snapshot, &actor, &id, false)
    }).await?;
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
    }).await?;
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
    }).await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "requirement": requirement, "iteration": iteration })),
    ))
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
    }).await?;
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
    }).await?;
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
    }).await?;
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
struct SubmitBody {
    #[serde(default)]
    summary: Option<String>,
}

async fn submit_requirement(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<SubmitBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::submit_requirement(snapshot, &actor, &id, input.summary.as_deref())
    }).await?;
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
    }).await?;
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
    }).await?;
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
    }).await?;
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
    }).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn design_claim(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::claim_design(snapshot, &actor, &id)
    }).await?;
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
    }).await?;
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
    _auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let snapshot = read_snapshot(&state).await?;
    let (artifact, content) = domain::get_artifact(&snapshot, &id)?;
    Ok(Json(json!({ "artifact": artifact, "content": content })))
}

async fn dev_assign(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::DevAssignInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::dev_assign(snapshot, &actor, &id, input)
    }).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformActionBody {
    platform_id: String,
}

async fn dev_claim(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<PlatformActionBody>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::dev_claim(snapshot, &actor, &id, &input.platform_id)
    }).await?;
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
            let branch = gitlab::branch_name(&requirement.code, &input.platform_id);
            match gitlab::create_branch(&state.config, &platform, &branch).await {
                Ok(()) => {
                    mutate(&state, |snapshot| {
                        if let Some(index) = snapshot
                            .requirements
                            .iter()
                            .position(|item| item.id == requirement.id)
                        {
                            if let Some(task) = snapshot.requirements[index]
                                .dev_task_mut(&input.platform_id)
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
                Err(error) => integration_warning = json!(error.message),
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
                    task.note = format!(
                        "{} GitLab 同步失败：{}",
                        task.note,
                        integration_warning.as_str().unwrap_or("")
                    )
                    .trim()
                    .to_string();
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
    let requirement = read_snapshot(&state)
        .await?
        .requirements
        .into_iter()
        .find(|item| item.id == requirement.id)
        .unwrap_or(requirement);
    Ok(Json(json!({
        "requirement": requirement,
        "integrationWarning": integration_warning
    })))
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
                .unwrap_or_else(|| gitlab::branch_name(&requirement.code, &platform_id));
            let title = format!("{} {}", requirement.code, requirement.title);
            let description = if note.trim().is_empty() {
                format!("{} / {}", requirement.code, platform_id)
            } else {
                note
            };
            match gitlab::create_merge_request(
                &state.config,
                &platform,
                &branch,
                &title,
                &description,
            )
            .await
            {
                Ok(mr) => {
                    let pipeline = gitlab::latest_pipeline(&state.config, &platform, &branch)
                        .await
                        .ok()
                        .flatten();
                    mutate(&state, |snapshot| {
                        if let Some(index) = snapshot
                            .requirements
                            .iter()
                            .position(|item| item.id == requirement.id)
                        {
                            if let Some(task) = snapshot.requirements[index]
                                .dev_task_mut(&platform_id)
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
                Err(error) => integration_warning = json!(error.message),
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
                    task.note = format!(
                        "{} GitLab 同步失败：{}",
                        task.note,
                        integration_warning.as_str().unwrap_or("")
                    )
                    .trim()
                    .to_string();
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
    let requirement = read_snapshot(&state)
        .await?
        .requirements
        .into_iter()
        .find(|item| item.id == requirement.id)
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
    }).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn test_start(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::test_start(snapshot, &actor, &id)
    }).await?;
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
    }).await?;
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
    }).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn freeze(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::freeze(snapshot, &actor, &id)
    }).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn unfreeze(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::unfreeze(snapshot, &actor, &id)
    }).await?;
    Ok(Json(json!({ "requirement": requirement })))
}

async fn release(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<domain::ReleaseInput>,
) -> Result<Json<Value>, ApiError> {
    let requirement = mutate(&state, |snapshot| {
        domain::release(snapshot, &actor, &id, input)
    }).await?;
    Ok(Json(json!({ "requirement": requirement })))
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
    }).await?;
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
    }).await?;
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
    }).await?;
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
    }).await?;
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
    }).await?;
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
        domain::archive_platform(
            snapshot,
            &actor,
            "platforms",
            &id,
            action == "restore",
        )
    }).await?;
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
        .filter(|skill| {
            actor.can_plan() || skill.scope == "global" || skill.owner_id == actor.id
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
    }).await?;
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
    }).await?;
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
    }).await?;
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
    }).await?;
    Ok(Json(json!({ "skill": skill })))
}

// ---------------------------------------------------------------------------
// Notifications / events
// ---------------------------------------------------------------------------

async fn list_notifications(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
) -> Result<Json<Value>, ApiError> {
    let items = notifications_for(&state, &actor.id, 100).await?;
    let unread = unread_notifications(&state, &actor.id).await?;
    let groups = notification_groups(&state, &actor.id).await?;
    Ok(Json(json!({
        "notifications": items,
        "unreadNotificationCount": unread,
        "notificationGroups": groups
    })))
}

/// 按需求聚合通知，供客户端做「全部 / 某个需求」筛选。未绑定需求的通知
/// 归入 `system` 组。
async fn notification_groups(state: &AppState, user_id: &str) -> Result<Vec<Value>, ApiError> {
    let items = notifications_for(state, user_id, 500).await?;
    let snapshot = read_snapshot(state).await?;
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
    for item in &items {
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
                title: requirement.map(|req| req.title.clone()).unwrap_or_else(|| "系统".to_string()),
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
    Ok(groups
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
        .collect())
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
    if input.ids.as_ref().map_or(false, |ids| ids.len() > 200) {
        return Err(ApiError::bad("一次最多标记 200 条通知为已读"));
    }
    mark_notifications_read(&state, &actor.id, input.ids.as_deref()).await?;
    let unread = unread_notifications(&state, &actor.id).await?;
    Ok(Json(json!({ "ok": true, "unreadNotificationCount": unread })))
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdminUserInput {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    roles: Option<Vec<String>>,
    #[serde(default)]
    platforms: Option<Vec<String>>,
    #[serde(default)]
    active: Option<bool>,
    #[serde(default)]
    active_role: Option<String>,
}

fn require_admin(actor: &User) -> Result<(), ApiError> {
    if actor.has_role(ROLE_ADMIN) {
        Ok(())
    } else {
        Err(ApiError::forbidden("只有管理员可以执行这个操作"))
    }
}

fn valid_role(role: &str) -> bool {
    matches!(
        role,
        ROLE_LEAD | ROLE_PRODUCT | ROLE_DESIGN | ROLE_DEV | ROLE_QA | ROLE_ADMIN
    )
}

async fn admin_update_user(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(id): Path<String>,
    Json(input): Json<AdminUserInput>,
) -> Result<Json<Value>, ApiError> {
    require_admin(&actor)?;
    let user = mutate(&state, |snapshot| {
        let index = snapshot
            .users
            .iter()
            .position(|user| user.id == id)
            .ok_or_else(|| ApiError::not_found("用户不存在"))?;
        if let Some(roles) = input.roles {
            if roles.iter().any(|role| !valid_role(role)) {
                return Err(ApiError::bad("包含未知角色"));
            }
            if roles.is_empty() {
                return Err(ApiError::bad("至少保留一个角色"));
            }
            snapshot.users[index].roles = roles;
        }
        if let Some(name) = input.name {
            let name = name.trim().to_string();
            if name.is_empty() {
                return Err(ApiError::bad("姓名不能为空"));
            }
            snapshot.users[index].name = name;
        }
        if let Some(platforms) = input.platforms {
            snapshot.users[index].platforms = platforms;
        }
        if let Some(active) = input.active {
            if !active && snapshot.users[index].id == actor.id {
                return Err(ApiError::bad("不能停用自己的账号"));
            }
            snapshot.users[index].active = active;
        }
        if let Some(role) = input.active_role {
            if !role.is_empty() && !valid_role(&role) {
                return Err(ApiError::bad("未知角色"));
            }
            snapshot.users[index].active_role = if role.is_empty() { None } else { Some(role) };
        }
        let admins = snapshot
            .users
            .iter()
            .filter(|user| user.active && user.has_role(ROLE_ADMIN))
            .count();
        if admins == 0 {
            return Err(ApiError::bad("至少保留一个启用的管理员"));
        }
        snapshot.push_event(
            Some(&actor.id),
            "admin.user_update",
            None,
            None,
            json!({ "userId": snapshot.users[index].id }),
        );
        Ok(snapshot.users[index].clone())
    })
    .await?;
    Ok(Json(json!({ "user": user.private_json() })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DingTalkSyncInput {
    #[serde(default)]
    disable_missing: Option<bool>,
}

fn unique_user_id(snapshot: &Snapshot, raw: &str) -> String {
    let base = format!(
        "dt-{}",
        raw.chars()
            .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_lowercase()
    );
    let base = if base == "dt-" { "dt-user".to_string() } else { base };
    if !snapshot.users.iter().any(|user| user.id == base) {
        return base;
    }
    let mut index = 2;
    loop {
        let candidate = format!("{base}-{index}");
        if !snapshot.users.iter().any(|user| user.id == candidate) {
            return candidate;
        }
        index += 1;
    }
}

async fn admin_dingtalk_sync(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(input): Json<DingTalkSyncInput>,
) -> Result<Json<Value>, ApiError> {
    require_admin(&actor)?;
    let (departments, org_users) = crate::dingtalk::fetch_org(&state.config).await?;
    let default_roles = if state.config.dingtalk_default_roles.is_empty() {
        vec![ROLE_DEV.to_string()]
    } else {
        state
            .config
            .dingtalk_default_roles
            .iter()
            .filter(|role| valid_role(role))
            .cloned()
            .collect()
    };
    let disable_missing = input
        .disable_missing
        .unwrap_or(state.config.dingtalk_disable_missing);
    let result = mutate(&state, |snapshot| {
        let mut created = 0usize;
        let mut updated = 0usize;
        let mut seen = HashSet::new();
        for org in &org_users {
            seen.insert(org.userid.clone());
            let existing = snapshot.users.iter().position(|user| {
                user.dingtalk_user_id.as_deref() == Some(org.userid.as_str())
                    || (org.unionid.is_some() && user.dingtalk_union_id == org.unionid)
                    || (org.mobile.is_some()
                        && !org.mobile.as_deref().unwrap_or("").is_empty()
                        && user.mobile == org.mobile)
            });
            if let Some(index) = existing {
                let user = &mut snapshot.users[index];
                user.dingtalk_user_id = Some(org.userid.clone());
                if org.unionid.is_some() {
                    user.dingtalk_union_id = org.unionid.clone();
                }
                if !org.name.trim().is_empty() {
                    user.name = org.name.clone();
                }
                if org.mobile.is_some() {
                    user.mobile = org.mobile.clone();
                }
                if org.avatar.is_some() {
                    user.avatar_url = org.avatar.clone();
                }
                if org.title.is_some() {
                    user.title = org.title.clone();
                }
                user.department_ids = org.department_ids.clone();
                user.active = org.active;
                updated += 1;
            } else {
                let id = unique_user_id(snapshot, &org.userid);
                snapshot.users.push(User {
                    id,
                    name: if org.name.trim().is_empty() {
                        org.userid.clone()
                    } else {
                        org.name.clone()
                    },
                    roles: default_roles.clone(),
                    platforms: Vec::new(),
                    active_platform_ids: Vec::new(),
                    active_role: default_roles.first().cloned(),
                    active: org.active,
                    onboarding_completed_at: None,
                    folder_configured: false,
                    dingtalk_user_id: Some(org.userid.clone()),
                    dingtalk_union_id: org.unionid.clone(),
                    dingtalk_open_id: None,
                    mobile: org.mobile.clone(),
                    avatar_url: org.avatar.clone(),
                    title: org.title.clone(),
                    department_ids: org.department_ids.clone(),
                    current_iteration_id: None,
                });
                created += 1;
            }
        }
        let mut disabled = 0usize;
        if disable_missing {
            for user in snapshot.users.iter_mut() {
                if user.id == actor.id {
                    continue;
                }
                if user.dingtalk_user_id.is_some()
                    && !seen.contains(user.dingtalk_user_id.as_deref().unwrap_or(""))
                    && user.active
                {
                    user.active = false;
                    disabled += 1;
                }
            }
        }
        snapshot.push_event(
            Some(&actor.id),
            "integration.dingtalk_sync",
            None,
            None,
            json!({
                "departments": departments.len(),
                "users": org_users.len(),
                "created": created,
                "updated": updated,
                "disabled": disabled
            }),
        );
        Ok(json!({
            "departments": departments.len(),
            "users": org_users.len(),
            "created": created,
            "updated": updated,
            "disabled": disabled
        }))
    })
    .await?;
    Ok(Json(result))
}

async fn gitlab_webhook(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, ApiError> {
    let token = headers
        .get("x-gitlab-token")
        .and_then(|value| value.to_str().ok());
    // 先验令牌，再解析 JSON：否则未认证请求可以用 8 MB 请求体反复消耗解析 CPU。
    if !gitlab::webhook_authorized(&state.config, token) {
        return Err(ApiError::unauthorized("GitLab Webhook 令牌无效"));
    }
    let payload: Value = serde_json::from_slice(&body)
        .map_err(|_| ApiError::bad("Webhook 请求体不是合法 JSON"))?;
    let delivery = headers
        .get("x-gitlab-event-uuid")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let project_id = payload
        .pointer("/project/id")
        .and_then(Value::as_i64)
        .map(|id| id.to_string());
    let project_path = payload
        .pointer("/project/path_with_namespace")
        .and_then(Value::as_str)
        .map(String::from);
    let kind = payload
        .get("object_kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if kind != "pipeline" && kind != "merge_request" {
        return Ok(Json(json!({ "ok": true, "ignored": kind })));
    }
    let attrs = payload.get("object_attributes").cloned().unwrap_or(Value::Null);
    let branch = if kind == "pipeline" {
        attrs.get("ref").and_then(Value::as_str)
    } else {
        attrs.get("source_branch").and_then(Value::as_str)
    }
    .unwrap_or_default()
    .to_string();
    if branch.is_empty() {
        return Ok(Json(json!({ "ok": true, "ignored": "no branch" })));
    }
    let status = attrs
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    // merge_request 的 url 是 API 地址（/api/v4/...），点进浏览器会 404；
    // 必须优先用 web_url。
    let url = if kind == "merge_request" {
        attrs.get("web_url").and_then(Value::as_str).map(String::from)
            .or_else(|| attrs.get("url").and_then(Value::as_str).map(String::from))
    } else {
        attrs.get("url").and_then(Value::as_str).map(String::from)
            .or_else(|| attrs.get("web_url").and_then(Value::as_str).map(String::from))
    };
    let mr_iid = attrs.get("iid").and_then(Value::as_i64);
    let platform_projects: Vec<(String, Option<String>, Option<String>)> = {
        let snapshot = read_snapshot(&state).await?;
        snapshot
            .platforms
            .iter()
            .map(|platform| {
                (
                    platform.id.clone(),
                    platform.gitlab_project_id.clone(),
                    platform.gitlab_project_path.clone(),
                )
            })
            .collect()
    };
    let updated = mutate(&state, |snapshot| {
        let mut found: Option<(String, String)> = None;
        for requirement in snapshot.requirements.iter_mut() {
            for task in requirement.dev_tasks.iter_mut() {
                if task.branch.as_deref() != Some(branch.as_str()) {
                    continue;
                }
                // 同名分支在不同 GitLab 项目里很常见；只接受平台配置的项目，
                // 避免一个能发 Webhook 的项目改写别的平台任务。
                let project_ok = platform_projects
                    .iter()
                    .find(|(id, _, _)| id == &task.platform_id)
                    .map(|(_, configured_id, configured_path)| {
                        let id_ok = match configured_id {
                            Some(configured) => project_id.as_deref() == Some(configured.as_str()),
                            None => true,
                        };
                        let path_ok = match configured_path {
                            Some(configured) => project_path.as_deref() == Some(configured.as_str()),
                            None => true,
                        };
                        id_ok && path_ok
                    })
                    .unwrap_or(false);
                if !project_ok {
                    continue;
                }
                if kind == "pipeline" && !status.is_empty() {
                    task.pipeline_status = Some(status.clone());
                    task.pipeline_url = url.clone();
                }
                if kind == "merge_request" {
                    if let Some(url) = url.clone() {
                        task.mr_url = Some(url);
                    }
                    // 不往用户手写的 note 里追加 “MR merged”：Webhook 每次重投都会
                    // 让文本无限增长。MR 状态本身已经保存在 mr_url/pipeline_status。
                }
                found = Some((requirement.id.clone(), task.platform_id.clone()));
                break;
            }
            if found.is_some() {
                break;
            }
        }
        if let Some((requirement_id, platform_id)) = &found {
            let duplicated = !delivery.is_empty()
                && snapshot.events.iter().any(|event| {
                    event.kind.starts_with("integration.gitlab")
                        && event.payload.get("delivery").and_then(Value::as_str) == Some(delivery.as_str())
                });
            if !duplicated {
                snapshot.push_event(
                    None,
                    if kind == "pipeline" {
                        "integration.gitlab_pipeline"
                    } else {
                        "integration.gitlab_mr_update"
                    },
                    Some(requirement_id),
                    None,
                    json!({
                        "platformId": platform_id,
                        "branch": branch,
                        "status": status,
                        "url": url,
                        "iid": mr_iid,
                        "delivery": delivery,
                    }),
                );
            }
        }
        Ok(found)
    })
    .await?;
    Ok(Json(json!({ "ok": true, "updated": updated.is_some() })))
}

async fn admin_integrations(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
) -> Result<Json<Value>, ApiError> {
    require_admin(&actor)?;
    Ok(Json(json!({
        "dingtalk": {
            "configured": state.config.dingtalk_client_id.is_some()
                && state.config.dingtalk_client_secret.is_some(),
            "orgSync": state.config.dingtalk_client_id.is_some()
                && state.config.dingtalk_client_secret.is_some(),
            "workNotify": state.config.dingtalk_work_notify,
            "agentIdConfigured": state.config.dingtalk_agent_id.is_some()
        },
        "gitlab": {
            "configured": state.config.gitlab_base_url.is_some()
                && state.config.gitlab_token.is_some(),
            "webhookConfigured": state.config.gitlab_webhook_secret.is_some()
        }
    })))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/auth/config", get(auth_config))
        .route("/auth/mock", post(auth_mock))
        .route("/auth/dingtalk/exchange", post(dingtalk_exchange))
        .route("/auth/session", get(auth_session))
        .route("/onboarding/complete", post(onboarding_complete))
        .route("/state", get(get_state))
        .route("/iterations", post(create_iteration))
        .route("/iterations/{id}", post(update_iteration))
        .route("/iterations/{id}/select", post(select_iteration))
        .route("/iterations/{id}/archive", post(archive_iteration))
        .route("/iterations/{id}/restore", post(restore_iteration))
        .route("/iterations/{id}/move-requirement", post(move_requirement))
        .route("/requirements", post(create_requirement))
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
        .route("/requirements/{id}/design-deliver", post(design_deliver))
        .route("/requirements/{id}/document", post(update_requirement_document))
        .route("/requirements/{id}/artifacts", post(add_artifact))
        .route("/artifacts/{id}", get(get_artifact))
        .route("/requirements/{id}/dev-assign", post(dev_assign))
        .route("/requirements/{id}/dev-claim", post(dev_claim))
        .route("/requirements/{id}/dev-start", post(dev_start))
        .route("/requirements/{id}/dev-finish", post(dev_finish))
        .route("/requirements/{id}/dev-reopen", post(dev_reopen))
        .route("/requirements/{id}/test-start", post(test_start))
        .route("/requirements/{id}/test-pass", post(test_pass))
        .route("/requirements/{id}/test-fail", post(test_fail))
        .route("/requirements/{id}/freeze", post(freeze))
        .route("/requirements/{id}/unfreeze", post(unfreeze))
        .route("/requirements/{id}/release", post(release))
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
        .route("/notifications", get(list_notifications))
        .route("/notifications/read", post(read_notifications))
        .route("/events", get(list_events))
        .route("/audit", get(list_audit))
        .route("/admin/users/{id}", post(admin_update_user))
        .route("/admin/dingtalk/sync", post(admin_dingtalk_sync))
        .route("/admin/integrations", get(admin_integrations))
        .route("/webhooks/gitlab", post(gitlab_webhook))
        .with_state(state)
}

// Keep the HashSet import used even when some feature branches are disabled.
#[allow(dead_code)]
fn _roles_set(roles: &[String]) -> HashSet<&str> {
    roles.iter().map(String::as_str).collect()
}
