//! GitLab Webhook 接收与投递去重（从 api.rs 拆出）。

use crate::api::{AppState, Store};
use crate::clientip::ClientIp;
use crate::db;
use crate::domain::ApiError;
use crate::gitlab;
use crate::store_ops::{lock_sqlite, mutate, read_snapshot};
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

async fn webhook_delivery_seen(state: &AppState, delivery: &str) -> Result<bool, ApiError> {
    if delivery.is_empty() {
        return Ok(false);
    }
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::has_webhook_delivery(&conn, delivery)?)
        }
        Store::Postgres(pool) => crate::pg::has_webhook_delivery(pool, delivery).await,
    }
}

pub(crate) async fn gitlab_webhook(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, ApiError> {
    // 令牌错误的请求也要限流：否则可以用 8 MB 请求体持续打解析前的比较路径。
    if !state.allow(&ip.key("webhook"), 120.0, 1.0) {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "Webhook 请求过于频繁",
        ));
    }
    let token = headers
        .get("x-gitlab-token")
        .and_then(|value| value.to_str().ok());
    // 先验令牌，再解析 JSON：否则未认证请求可以用 8 MB 请求体反复消耗解析 CPU。
    if !gitlab::webhook_authorized(&state.config, token) {
        return Err(ApiError::unauthorized("GitLab Webhook 令牌无效"));
    }
    let payload: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::bad("Webhook 请求体不是合法 JSON"))?;
    let delivery = headers
        .get("x-gitlab-event-uuid")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let delivery_already_seen = webhook_delivery_seen(&state, &delivery).await?;
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
    let attrs = payload
        .get("object_attributes")
        .cloned()
        .unwrap_or(Value::Null);
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
        attrs
            .get("web_url")
            .and_then(Value::as_str)
            .map(String::from)
            .or_else(|| attrs.get("url").and_then(Value::as_str).map(String::from))
    } else {
        attrs
            .get("url")
            .and_then(Value::as_str)
            .map(String::from)
            .or_else(|| {
                attrs
                    .get("web_url")
                    .and_then(Value::as_str)
                    .map(String::from)
            })
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
                            Some(configured) => {
                                project_path.as_deref() == Some(configured.as_str())
                            }
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
            let sqlite_dup = delivery_already_seen;
            let duplicated = sqlite_dup
                || (!delivery.is_empty()
                    && snapshot.events.iter().any(|event| {
                        event.kind.starts_with("integration.gitlab")
                            && event.payload.get("delivery").and_then(Value::as_str)
                                == Some(delivery.as_str())
                    }));
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
    if !delivery.is_empty() {
        if let Store::Postgres(pool) = &state.store {
            if let Err(error) = crate::pg::record_webhook_delivery(pool, &delivery).await {
                tracing::warn!("记录 GitLab Webhook 投递去重失败：{}", error.message);
            }
        }
    }
    Ok(Json(json!({ "ok": true, "updated": updated.is_some() })))
}
