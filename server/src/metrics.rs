//! 轻量请求指标与 `/metrics` 端点。
//!
//! 从 api.rs 拆出，保持 `AppState` 只负责装配。计数器是进程级的，用于基础可观测性。

use crate::api::AppState;
use axum::extract::State;

/// 轻量请求计数器：总请求数与 5xx 错误数。
pub struct Metrics {
    pub requests: std::sync::atomic::AtomicU64,
    pub errors: std::sync::atomic::AtomicU64,
    pub duration_ms_sum: std::sync::atomic::AtomicU64,
    pub slow_requests: std::sync::atomic::AtomicU64,
    pub started: std::time::Instant,
}

/// 慢请求阈值（毫秒），可用 WORKBENCH_SLOW_MS 覆盖，默认 1000。
fn slow_threshold_ms() -> u64 {
    static CACHE: std::sync::OnceLock<u64> = std::sync::OnceLock::new();
    *CACHE.get_or_init(|| {
        std::env::var("WORKBENCH_SLOW_MS")
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(1000)
    })
}

impl Metrics {
    pub fn new() -> Self {
        Self {
            requests: std::sync::atomic::AtomicU64::new(0),
            errors: std::sync::atomic::AtomicU64::new(0),
            duration_ms_sum: std::sync::atomic::AtomicU64::new(0),
            slow_requests: std::sync::atomic::AtomicU64::new(0),
            started: std::time::Instant::now(),
        }
    }
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}

pub async fn track_metrics(
    State(state): State<AppState>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use std::sync::atomic::Ordering;
    state.metrics.requests.fetch_add(1, Ordering::Relaxed);
    let started = std::time::Instant::now();
    let response = next.run(request).await;
    let elapsed_ms = started.elapsed().as_millis() as u64;
    state
        .metrics
        .duration_ms_sum
        .fetch_add(elapsed_ms, Ordering::Relaxed);
    if elapsed_ms > slow_threshold_ms() {
        state.metrics.slow_requests.fetch_add(1, Ordering::Relaxed);
        tracing::warn!(
            "慢请求：{} ms（阈值 {} ms）",
            elapsed_ms,
            slow_threshold_ms()
        );
    }
    if response.status().is_server_error() {
        state
            .metrics
            .errors
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }
    response
}

pub async fn scrape(State(state): State<AppState>) -> impl axum::response::IntoResponse {
    use std::sync::atomic::Ordering;
    let requests = state.metrics.requests.load(Ordering::Relaxed);
    let errors = state.metrics.errors.load(Ordering::Relaxed);
    let duration = state.metrics.duration_ms_sum.load(Ordering::Relaxed);
    let slow = state.metrics.slow_requests.load(Ordering::Relaxed);
    let uptime = state.metrics.started.elapsed().as_secs();
    let body = format!(
        "# HELP workbench_requests_total HTTP 请求总数\n\
         # TYPE workbench_requests_total counter\n\
         workbench_requests_total {requests}\n\
         # HELP workbench_errors_total 5xx 响应数\n\
         # TYPE workbench_errors_total counter\n\
         workbench_errors_total {errors}\n\
         # HELP workbench_request_duration_ms_sum 累计请求耗时(毫秒)\n\
         # TYPE workbench_request_duration_ms_sum counter\n\
         workbench_request_duration_ms_sum {duration}\n\
         # HELP workbench_slow_requests_total 超过慢阈值的请求数\n\
         # TYPE workbench_slow_requests_total counter\n\
         workbench_slow_requests_total {slow}\n\
         # HELP workbench_uptime_seconds 进程运行秒数\n\
         # TYPE workbench_uptime_seconds gauge\n\
         workbench_uptime_seconds {uptime}\n"
    );
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        body,
    )
}
