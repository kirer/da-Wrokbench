//! GitLab 集成：分支、MR 和流水线状态。
//!
//! 配置了 `GITLAB_BASE_URL` / `GITLAB_TOKEN` 时，开始开发会创建分支，完成开发会
//! 创建 MR；未配置时保留原有 Mock 链接，便于本地演示。流水线状态优先由
//! `/webhooks/gitlab` 回写，也可以在开发完成时主动查一次。

use crate::api::Config;
use crate::domain::ApiError;
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct MrInfo {
    pub url: String,
    pub iid: i64,
}

pub fn configured(config: &Config) -> bool {
    config.gitlab_base_url.is_some() && config.gitlab_token.is_some()
}

fn gateway(message: impl Into<String>) -> ApiError {
    ApiError::new(StatusCode::BAD_GATEWAY, message)
}

fn project_ref(platform: &crate::models::Platform) -> Option<String> {
    platform
        .gitlab_project_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .or_else(|| {
            platform
                .gitlab_project_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .map(|value| url_encode(value.trim()))
        })
}

use crate::dingtalk::url_encode;

/// 单次 GitLab 调用的总超时；连接超时沿用共享客户端的 5 秒。
const GITLAB_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

fn client(config: &Config) -> Result<reqwest::Client, ApiError> {
    if !configured(config) {
        return Err(gateway("GitLab 未配置"));
    }
    Ok(crate::dingtalk::shared_http_client().clone())
}

fn base(config: &Config) -> String {
    config
        .gitlab_base_url
        .as_deref()
        .unwrap_or_default()
        .trim_end_matches('/')
        .to_string()
}

fn token(config: &Config) -> String {
    config.gitlab_token.clone().unwrap_or_default()
}

/// 默认分支命名：feature/{code}-{platform}。可通过 GITLAB_BRANCH_TEMPLATE 配置
/// 项目级前缀规范（如 feat/{code}-{platform}），占位符 {code}/{platform}。
pub fn branch_name(config: &Config, code: &str, platform_id: &str) -> String {
    let template = config
        .gitlab_branch_template
        .as_deref()
        .map(str::trim)
        .filter(|value| value.contains("{code}"))
        .unwrap_or("feature/{code}-{platform}");
    template
        .replace("{code}", &code.to_lowercase())
        .replace("{platform}", platform_id)
}

pub async fn create_branch(
    config: &Config,
    platform: &crate::models::Platform,
    branch: &str,
) -> Result<(), ApiError> {
    let project = project_ref(platform)
        .ok_or_else(|| gateway("平台还没有配置 GitLab 项目（projectId 或 projectPath）"))?;
    let response = client(config)?
        .post(format!(
            "{}/api/v4/projects/{}/repository/branches",
            base(config),
            project
        ))
        .timeout(GITLAB_TIMEOUT)
        .header("PRIVATE-TOKEN", token(config))
        .json(&json!({
            "branch": branch,
            "ref": config.gitlab_default_branch
        }))
        .send()
        .await
        .map_err(|error| gateway(format!("GitLab 创建分支请求失败：{error}")))?;
    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if status.as_u16() == 400 && text.to_lowercase().contains("already exists") {
        return Ok(());
    }
    Err(gateway(format!("GitLab 创建分支失败（{status}）：{text}")))
}

#[derive(Deserialize)]
struct RawMr {
    #[serde(default)]
    web_url: String,
    #[serde(default)]
    iid: i64,
}

pub async fn create_merge_request(
    config: &Config,
    platform: &crate::models::Platform,
    source: &str,
    title: &str,
    description: &str,
) -> Result<MrInfo, ApiError> {
    let project = project_ref(platform)
        .ok_or_else(|| gateway("平台还没有配置 GitLab 项目（projectId 或 projectPath）"))?;
    let http = client(config)?;
    let response = http
        .post(format!(
            "{}/api/v4/projects/{}/merge_requests",
            base(config),
            project
        ))
        .timeout(GITLAB_TIMEOUT)
        .header("PRIVATE-TOKEN", token(config))
        .json(&json!({
            "source_branch": source,
            "target_branch": config.gitlab_default_branch,
            "title": title,
            "description": description,
            "remove_source_branch": true
        }))
        .send()
        .await
        .map_err(|error| gateway(format!("GitLab 创建 MR 请求失败：{error}")))?;
    if response.status().is_success() {
        let mr: RawMr = response
            .json()
            .await
            .map_err(|error| gateway(format!("GitLab MR 响应不合法：{error}")))?;
        if mr.web_url.is_empty() {
            return Err(gateway("GitLab 没有返回 MR 地址"));
        }
        return Ok(MrInfo {
            url: mr.web_url,
            iid: mr.iid,
        });
    }
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    // 已存在同一个 source_branch 的 MR 时，查回来而不是报错。
    let existing = http
        .get(format!(
            "{}/api/v4/projects/{}/merge_requests?state=opened&source_branch={}",
            base(config),
            project,
            url_encode(source)
        ))
        .header("PRIVATE-TOKEN", token(config))
        .send()
        .await
        .ok();
    if let Some(existing) = existing {
        if existing.status().is_success() {
            if let Ok(items) = existing.json::<Vec<RawMr>>().await {
                if let Some(mr) = items.into_iter().find(|item| !item.web_url.is_empty()) {
                    return Ok(MrInfo {
                        url: mr.web_url,
                        iid: mr.iid,
                    });
                }
            }
        }
    }
    Err(gateway(format!("GitLab 创建 MR 失败（{status}）：{text}")))
}

#[derive(Debug, Clone)]
pub struct PipelineInfo {
    pub status: String,
    pub url: Option<String>,
}

pub async fn latest_pipeline(
    config: &Config,
    platform: &crate::models::Platform,
    branch: &str,
) -> Result<Option<PipelineInfo>, ApiError> {
    let project = project_ref(platform)
        .ok_or_else(|| gateway("平台还没有配置 GitLab 项目（projectId 或 projectPath）"))?;
    let response = client(config)?
        .get(format!(
            "{}/api/v4/projects/{}/pipelines?ref={}&per_page=1",
            base(config),
            project,
            url_encode(branch)
        ))
        .timeout(GITLAB_TIMEOUT)
        .header("PRIVATE-TOKEN", token(config))
        .send()
        .await
        .map_err(|error| gateway(format!("GitLab 查询流水线失败：{error}")))?;
    if !response.status().is_success() {
        return Err(gateway(format!(
            "GitLab 查询流水线失败（{}）",
            response.status()
        )));
    }
    let items: Vec<Value> = response
        .json()
        .await
        .map_err(|error| gateway(format!("GitLab 流水线响应不合法：{error}")))?;
    Ok(items.first().map(|item| PipelineInfo {
        status: item
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        url: item
            .get("web_url")
            .and_then(Value::as_str)
            .map(String::from),
    }))
}

pub fn webhook_authorized(config: &Config, token_header: Option<&str>) -> bool {
    let secret = config.gitlab_webhook_secret.as_deref().unwrap_or("");
    match token_header {
        Some(token) => !secret.is_empty() && crate::api::constant_time_eq(token, secret),
        None => false,
    }
}
