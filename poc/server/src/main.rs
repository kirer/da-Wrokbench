mod api;
mod db;
mod dingtalk;
mod domain;
mod gitlab;
mod models;
mod pg;
mod seed;

use api::{AppState, Config};
use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderName, HeaderValue, Method};
use std::net::SocketAddr;
use std::time::Duration;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn env_value(name: &str, fallback: &str) -> String {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn env_opt(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "dsh_workbench_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let app_env = env_value("APP_ENV", "development").to_lowercase();
    // 只把 development/dev/test 视为开发环境；任何拼写错误或其他值都按生产处理，
    // 避免 APP_ENV=prod / staging 时绕过安全校验。
    let development = matches!(app_env.as_str(), "development" | "dev" | "test");
    let production = !development;
    let auth_provider = env_value("WORKBENCH_AUTH_PROVIDER", "mock").to_lowercase();
    if auth_provider != "mock" && auth_provider != "dingtalk" {
        panic!("WORKBENCH_AUTH_PROVIDER 只支持 mock 或 dingtalk，当前是 {auth_provider}");
    }
    if production && auth_provider == "mock" {
        panic!("非开发环境禁止 WORKBENCH_AUTH_PROVIDER=mock，请切换为 dingtalk");
    }
    let auth_secret = env_value(
        "WORKBENCH_AUTH_SECRET",
        "dsh-workbench-poc-server-secret-change-me",
    );
    let internal_token = env_value(
        "WORKBENCH_INTERNAL_TOKEN",
        "dsh-workbench-poc-internal-token",
    );
    const KNOWN_WEAK_SECRETS: [&str; 4] = [
        "dsh-workbench-poc-server-secret-change-me",
        "dsh-workbench-poc-internal-token",
        "change-me-to-a-long-random-string",
        "change-me-to-another-long-random-string",
    ];
    if production
        && (KNOWN_WEAK_SECRETS.contains(&auth_secret.as_str()) || auth_secret.len() < 32)
    {
        panic!("生产环境必须设置至少 32 字符的随机 WORKBENCH_AUTH_SECRET");
    }
    if production
        && (KNOWN_WEAK_SECRETS.contains(&internal_token.as_str()) || internal_token.len() < 32)
    {
        panic!("生产环境必须设置至少 32 字符的随机 WORKBENCH_INTERNAL_TOKEN");
    }
    if auth_provider == "dingtalk"
        && (env_opt("DINGTALK_CLIENT_ID").is_none()
            || env_opt("DINGTALK_CLIENT_SECRET").is_none())
    {
        panic!("钉钉登录需要 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET");
    }
    let gitlab_webhook_secret = env_opt("GITLAB_WEBHOOK_SECRET");
    if production
        && env_opt("GITLAB_BASE_URL").is_some()
        && gitlab_webhook_secret.as_deref().map_or(true, |secret| {
            secret.len() < 32 || KNOWN_WEAK_SECRETS.contains(&secret)
        })
    {
        panic!("配置 GitLab 后，生产环境必须设置至少 32 字符的随机 GITLAB_WEBHOOK_SECRET");
    }
    let mut token_ttl_seconds: i64 = env_value("WORKBENCH_TOKEN_TTL_SECONDS", "604800")
        .parse()
        .unwrap_or(604800);
    if token_ttl_seconds <= 0 {
        panic!("WORKBENCH_TOKEN_TTL_SECONDS 必须是正整数");
    }
    // 最长 30 天；没有吊销机制时，过长 TTL 等于把退出登录变成摆设。
    token_ttl_seconds = token_ttl_seconds.min(30 * 24 * 60 * 60);
    if !production
        && (auth_secret == "dsh-workbench-poc-server-secret-change-me"
            || internal_token == "dsh-workbench-poc-internal-token")
    {
        tracing::warn!("使用 POC 默认密钥；生产环境必须设置 WORKBENCH_AUTH_SECRET 与 WORKBENCH_INTERNAL_TOKEN");
    }

    let database_path = env_value("DATABASE_PATH", "./data/workbench.db");
    let database_url = env_opt("DATABASE_URL");
    let port: u16 = env_value("PORT", "3210").parse().unwrap_or(3210);
    let allowed_origins: Vec<String> = env_opt("WORKBENCH_ALLOWED_ORIGINS")
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    let allow_remote_internal = matches!(
        env_value("WORKBENCH_INTERNAL_ALLOW_REMOTE", "0").to_ascii_lowercase().as_str(),
        "1" | "true" | "yes"
    );
    let config = Config {
        auth_provider,
        auth_secret,
        internal_token,
        public_url: env_opt("WORKBENCH_PUBLIC_URL"),
        dingtalk_client_id: env_opt("DINGTALK_CLIENT_ID"),
        dingtalk_client_secret: env_opt("DINGTALK_CLIENT_SECRET"),
        dingtalk_agent_id: env_opt("DINGTALK_AGENT_ID"),
        dingtalk_work_notify: matches!(
            env_value("DINGTALK_WORK_NOTIFY", "0").to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        ) && env_opt("DINGTALK_AGENT_ID").is_some(),
        dingtalk_api_base: env_value("DINGTALK_API_BASE", "https://oapi.dingtalk.com")
            .trim_end_matches('/')
            .to_string(),
        dingtalk_oauth_base: env_value("DINGTALK_OAUTH_BASE", "https://api.dingtalk.com")
            .trim_end_matches('/')
            .to_string(),
        dingtalk_default_roles: env_value("DINGTALK_DEFAULT_ROLES", "dev")
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(String::from)
            .collect(),
        dingtalk_sync_root_dept: env_value("DINGTALK_SYNC_ROOT_DEPT", "1")
            .parse()
            .unwrap_or(1),
        dingtalk_disable_missing: matches!(
            env_value("DINGTALK_SYNC_DISABLE_MISSING", "0")
                .to_ascii_lowercase()
                .as_str(),
            "1" | "true" | "yes"
        ),
        gitlab_base_url: env_opt("GITLAB_BASE_URL"),
        gitlab_token: env_opt("GITLAB_TOKEN"),
        gitlab_webhook_secret,
        gitlab_default_branch: env_value("GITLAB_DEFAULT_BRANCH", "main"),
        token_ttl_seconds,
        allow_remote_internal,
    };

    if config.dingtalk_work_notify {
        dingtalk::init_notifier(std::sync::Arc::new(config.clone()));
        tracing::info!("钉钉工作通知已启用");
    }

    let state = if let Some(url) = database_url {
        let pool = pg::open(&url).unwrap_or_else(|error| panic!("{error}"));
        pg::init(&pool)
            .await
            .unwrap_or_else(|error| panic!("{error}"));
        tracing::info!("database backend: postgres");
        AppState::new_postgres(pool, config)
    } else {
        let conn = db::open(&database_path).unwrap_or_else(|error| {
            panic!("打开数据库 {database_path} 失败：{error}");
        });
        tracing::info!("database backend: sqlite ({database_path})");
        AppState::new_sqlite(conn, config)
    };

    let mut app = api::router(state);
    if !allowed_origins.is_empty() {
        let origins: Vec<HeaderValue> = allowed_origins
            .iter()
            .filter_map(|origin| HeaderValue::from_str(origin).ok())
            .collect();
        let cors = CorsLayer::new()
            .allow_origin(AllowOrigin::list(origins))
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers([
                header::AUTHORIZATION,
                header::CONTENT_TYPE,
                header::ACCEPT,
            ])
            .expose_headers([header::CONTENT_TYPE]);
        app = app.layer(cors);
        tracing::info!("CORS allowlist: {}", allowed_origins.join(", "));
    }
    let app = app
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("content-security-policy"),
            HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'; base-uri 'none'"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(TraceLayer::new_for_http());

    let bind_addr = env_value("WORKBENCH_BIND_ADDR", "127.0.0.1");
    if production && bind_addr != "127.0.0.1" && bind_addr != "::1" && !allow_remote_internal {
        panic!("非开发环境绑定非回环地址时必须显式设置 WORKBENCH_INTERNAL_ALLOW_REMOTE=1，并自行配置网络隔离与 TLS");
    }
    let address = if bind_addr.contains(':') {
        format!("[{bind_addr}]:{port}")
    } else {
        format!("{bind_addr}:{port}")
    };
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .unwrap_or_else(|error| panic!("监听 {address} 失败：{error}"));
    tracing::info!("dsh-workbench-server listening on http://{address}");
    tracing::info!("auth provider: {}", env_value("WORKBENCH_AUTH_PROVIDER", "mock"));

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server exit");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
