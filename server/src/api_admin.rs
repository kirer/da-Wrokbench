//! 管理相关接口（从 api.rs 拆出）：管理员改用户资料 + 审计差异 + require_admin。

use crate::api::{AppState, AuthUser};
use crate::db::Snapshot;
use crate::domain::{valid_role, ApiError};
use crate::models::{User, ROLE_ADMIN, ROLE_DEV};
use crate::store_ops::mutate;
use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AdminUserInput {
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

pub(crate) fn require_admin(actor: &User) -> Result<(), ApiError> {
    if actor.has_role(ROLE_ADMIN) {
        Ok(())
    } else {
        Err(ApiError::forbidden("只有管理员可以执行这个操作"))
    }
}

pub(crate) async fn admin_update_user(
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
        let before = snapshot.users[index].clone();
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
            if name.chars().count() > 60 {
                return Err(ApiError::bad("姓名长度不能超过 60"));
            }
            if name.chars().any(char::is_control) {
                return Err(ApiError::bad("姓名不能包含控制字符"));
            }
            snapshot.users[index].name = name;
            snapshot.users[index].name_by_admin = true;
        }
        if let Some(platforms) = input.platforms {
            let valid_ids: HashSet<&str> = snapshot
                .platforms
                .iter()
                .map(|platform| platform.id.as_str())
                .collect();
            for pid in &platforms {
                if !valid_ids.contains(pid.as_str()) {
                    return Err(ApiError::bad(format!("包含未知平台「{pid}」")));
                }
            }
            snapshot.users[index].platforms = platforms;
        }
        if let Some(active) = input.active {
            if !active && snapshot.users[index].id == actor.id {
                return Err(ApiError::bad("不能停用自己的账号"));
            }
            snapshot.users[index].active = active;
            snapshot.users[index].disabled_by_admin = !active;
        }
        if let Some(role) = input.active_role {
            if !role.is_empty() && !valid_role(&role) {
                return Err(ApiError::bad("未知角色"));
            }
            if !role.is_empty() && !snapshot.users[index].roles.contains(&role) {
                return Err(ApiError::bad("当前启用角色必须包含在成员角色中"));
            }
            snapshot.users[index].active_role = if role.is_empty() { None } else { Some(role) };
        } else if let Some(current_active) = snapshot.users[index].active_role.as_ref() {
            if !snapshot.users[index].roles.contains(current_active) {
                snapshot.users[index].active_role = snapshot.users[index].roles.first().cloned();
            }
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
            json!({
                "userId": snapshot.users[index].id,
                "changes": user_changes(&before, &snapshot.users[index]),
            }),
        );
        Ok(snapshot.users[index].clone())
    })
    .await?;
    Ok(Json(json!({ "user": user.private_json() })))
}

/// 审计日志只记真正改动的字段及前后值，排查“谁把谁停用了”时不用猜。
fn user_changes(before: &User, after: &User) -> Value {
    let mut changes = serde_json::Map::new();
    if before.roles != after.roles {
        changes.insert(
            "roles".into(),
            json!({ "from": before.roles, "to": after.roles }),
        );
    }
    if before.name != after.name {
        changes.insert(
            "name".into(),
            json!({ "from": before.name, "to": after.name }),
        );
    }
    if before.platforms != after.platforms {
        changes.insert(
            "platforms".into(),
            json!({ "from": before.platforms, "to": after.platforms }),
        );
    }
    if before.active != after.active {
        changes.insert(
            "active".into(),
            json!({ "from": before.active, "to": after.active }),
        );
    }
    if before.active_role != after.active_role {
        changes.insert(
            "activeRole".into(),
            json!({ "from": before.active_role, "to": after.active_role }),
        );
    }
    Value::Object(changes)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DingTalkSyncInput {
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
    let base = if base == "dt-" {
        "dt-user".to_string()
    } else {
        base
    };
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

pub(crate) async fn admin_dingtalk_sync(
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
                // 管理员手动改过的姓名保留；离职（钉钉停用）一定会停用本地账号，
                // 但钉钉“仍在职”不能把管理员手动停用的账号重新启用。
                if !org.name.trim().is_empty() && !user.name_by_admin {
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
                if !org.active {
                    user.active = false;
                } else if !user.disabled_by_admin {
                    user.active = true;
                }
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
                    current_project_id: None,
                    disabled_by_admin: false,
                    name_by_admin: false,
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

pub(crate) async fn admin_integrations(
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
