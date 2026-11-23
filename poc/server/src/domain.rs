use crate::db::Snapshot;
use crate::models::*;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }

    pub fn bad(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        // 5xx 可能包含数据库/上游细节，只写日志，不回传客户端。
        if self.status.is_server_error() {
            tracing::error!("internal error: {}", self.message);
            return (
                self.status,
                Json(json!({ "error": "服务端内部错误，请稍后重试" })),
            )
                .into_response();
        }
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(error: rusqlite::Error) -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("数据库错误：{error}"),
        )
    }
}

pub fn require_plan(actor: &User, what: &str) -> Result<(), ApiError> {
    if !actor.can_plan() {
        return Err(ApiError::forbidden(format!(
            "{} 没有{}权限（需要负责人/管理员身份）",
            actor.name, what
        )));
    }
    Ok(())
}

fn user_name(snap: &Snapshot, id: &str) -> String {
    snap.user(id)
        .map(|user| user.name.clone())
        .unwrap_or_else(|| id.to_string())
}

pub fn requirement_label(requirement: &Requirement) -> String {
    format!("{}「{}」", requirement.code, requirement.title)
}

pub fn status_label(status: &str) -> &'static str {
    match status {
        STATUS_DRAFT => "草稿",
        STATUS_CREATING => "创建中",
        STATUS_CREATE_FAILED => "创建失败",
        STATUS_PENDING_REVIEW => "待评审",
        STATUS_CHANGES_REQUESTED => "待修改",
        STATUS_APPROVED => "已通过",
        STATUS_SCHEDULED => "已排期",
        STATUS_BACKLOG => "已暂缓",
        STATUS_IN_PROGRESS => "开发中",
        STATUS_DEV_DONE => "待测试",
        STATUS_TESTING => "测试中",
        STATUS_TEST_FAILED => "测试不通过",
        STATUS_TEST_PASSED => "测试通过",
        STATUS_FROZEN => "已冻结",
        STATUS_RELEASED => "已发布",
        STATUS_DONE => "已完成",
        _ => "未知状态",
    }
}

fn validate_date(value: Option<&str>, label: &str) -> Result<String, ApiError> {
    let text = value.unwrap_or_default().trim();
    if text.is_empty() {
        return Ok(String::new());
    }
    if chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d").is_err() {
        return Err(ApiError::bad(format!("{label}格式应为 YYYY-MM-DD")));
    }
    Ok(text.to_string())
}

fn active_platforms(snap: &Snapshot) -> Vec<&Platform> {
    let active_groups: HashSet<&str> = snap
        .groups
        .iter()
        .filter(|group| group.active)
        .map(|group| group.id.as_str())
        .collect();
    snap.platforms
        .iter()
        .filter(|platform| platform.active && active_groups.contains(platform.group_id.as_str()))
        .collect()
}

pub fn default_platform_ids(snap: &Snapshot, actor: &User) -> Vec<String> {
    let active = active_platforms(snap);
    let active_ids: HashSet<&str> = active.iter().map(|platform| platform.id.as_str()).collect();
    let scoped: Vec<String> = actor
        .active_platform_ids
        .iter()
        .filter(|id| active_ids.contains(id.as_str()))
        .cloned()
        .collect();
    if !scoped.is_empty() {
        return scoped;
    }
    let owned: Vec<String> = actor
        .platforms
        .iter()
        .filter(|id| active_ids.contains(id.as_str()))
        .cloned()
        .collect();
    if !owned.is_empty() {
        return owned;
    }
    let preferred: Vec<String> = ["trade-server", "web"]
        .iter()
        .filter(|id| active_ids.contains(**id))
        .map(|id| id.to_string())
        .collect();
    if !preferred.is_empty() {
        return preferred;
    }
    active
        .iter()
        .take(2)
        .map(|platform| platform.id.clone())
        .collect()
}

fn next_code(snap: &Snapshot, iteration: &Iteration) -> String {
    let prefix = format!("{}-", iteration.short_code);
    let mut max = 0u32;
    for requirement in &snap.requirements {
        if requirement.iteration_id != iteration.id {
            continue;
        }
        if let Some(rest) = requirement.code.strip_prefix(&prefix) {
            if let Ok(value) = rest.parse::<u32>() {
                max = max.max(value);
            }
        }
    }
    format!("{}{:03}", prefix, max + 1)
}

fn unique_short_code(snap: &Snapshot, code: &str) -> String {
    let derived = code
        .split('-')
        .last()
        .unwrap_or(code)
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase();
    let derived = if derived.is_empty() {
        "S".to_string()
    } else {
        derived
    };
    let mut short = derived.clone();
    let mut index = 2;
    while snap
        .iterations
        .iter()
        .any(|iteration| iteration.short_code == short)
    {
        short = format!("{derived}{index}");
        index += 1;
    }
    short
}

fn next_order<T, F>(items: &[T], value: F) -> i64
where
    F: Fn(&T) -> i64,
{
    items.iter().map(|item| value(item)).max().unwrap_or(0) + 1
}

fn make_entity_id<'a>(
    existing: impl Iterator<Item = &'a str>,
    prefix: &str,
    name: &str,
) -> String {
    let existing: HashSet<&str> = existing.collect();
    let ascii = name
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    let ascii = ascii.trim_matches('-');
    let base = if ascii.is_empty() {
        format!("{prefix}-{}", &uuid::Uuid::new_v4().to_string()[..8])
    } else {
        format!("{prefix}-{}", &ascii[..ascii.len().min(24)])
    };
    let mut id = base.clone();
    let mut index = 2;
    while existing.contains(id.as_str()) {
        id = format!("{base}-{index}");
        index += 1;
    }
    id
}

fn req_index(snap: &Snapshot, reference: &str) -> Result<usize, ApiError> {
    snap.requirement_index(reference)
        .ok_or_else(|| ApiError::not_found(format!("找不到需求「{reference}」")))
}

fn planner_ids(snap: &Snapshot) -> Vec<String> {
    snap.users
        .iter()
        .filter(|user| user.active && user.can_plan())
        .map(|user| user.id.clone())
        .collect()
}

fn qa_ids(snap: &Snapshot) -> Vec<String> {
    snap.users
        .iter()
        .filter(|user| user.active && user.has_role(ROLE_QA))
        .map(|user| user.id.clone())
        .collect()
}

fn dev_assignee_ids(requirement: &Requirement) -> Vec<String> {
    requirement
        .dev_tasks
        .iter()
        .filter_map(|task| task.assignee_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect()
}

fn ensure_status(requirement: &Requirement, allowed: &[&str], action: &str) -> Result<(), ApiError> {
    if !allowed.contains(&requirement.status.as_str()) {
        return Err(ApiError::conflict(format!(
            "需求当前是「{}」，不能{action}",
            status_label(&requirement.status)
        )));
    }
    Ok(())
}

fn check_not_creating(requirement: &Requirement, action: &str) -> Result<(), ApiError> {
    if requirement.status == STATUS_CREATING {
        return Err(ApiError::conflict(format!("需求还在创建中，稍后再{action}")));
    }
    if requirement.status == STATUS_CREATE_FAILED {
        return Err(ApiError::conflict(format!(
            "需求文件夹/会话创建失败，先重试创建再{action}"
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Iterations
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IterationInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub phase: Option<String>,
    pub status: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub reviewer_ids: Option<Vec<String>>,
}

pub fn create_iteration(
    snap: &mut Snapshot,
    actor: &User,
    input: IterationInput,
) -> Result<Iteration, ApiError> {
    require_plan(actor, "创建迭代的")?;
    let code = input.code.unwrap_or_default().trim().to_string();
    if code.is_empty() {
        return Err(ApiError::bad("迭代编码不能为空，例如 2026-S12"));
    }
    if code.chars().count() > 40 || code == "." || code == ".." {
        return Err(ApiError::bad("迭代编码长度不能超过 40，且不能是 . 或 .."));
    }
    if !code
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-')
    {
        return Err(ApiError::bad(
            "迭代编码只能包含字母、数字、点、下划线和短横线",
        ));
    }
    if snap
        .iterations
        .iter()
        .any(|iteration| iteration.code.eq_ignore_ascii_case(&code))
    {
        return Err(ApiError::conflict(format!("迭代编码「{code}」已存在")));
    }
    let start_date = validate_date(input.start_date.as_deref(), "开始日期")?;
    let end_date = validate_date(input.end_date.as_deref(), "结束日期")?;
    if !start_date.is_empty() && !end_date.is_empty() && start_date > end_date {
        return Err(ApiError::bad("开始日期不能晚于结束日期"));
    }
    let mut reviewer_ids = Vec::new();
    for id in input.reviewer_ids.unwrap_or_else(|| vec![actor.id.clone()]) {
        if reviewer_ids.contains(&id) {
            continue;
        }
        let user = snap
            .active_user(&id)
            .ok_or_else(|| ApiError::bad(format!("会签人「{id}」不存在或已停用")))?;
        if !user.can_plan() {
            return Err(ApiError::bad(format!(
                "{} 不是负责人/管理员，不能作为会签人",
                user.name
            )));
        }
        reviewer_ids.push(id);
    }
    if reviewer_ids.is_empty() {
        reviewer_ids.push(actor.id.clone());
    }
    let iteration = Iteration {
        id: format!("iteration-{}", uuid::Uuid::new_v4()),
        code: code.clone(),
        short_code: unique_short_code(snap, &code),
        name: input
            .name
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| code.clone()),
        phase: input
            .phase
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "需求 / 设计 / 开发 / 测试".to_string()),
        status: "planning".to_string(),
        start_date,
        end_date,
        owner_id: Some(actor.id.clone()),
        reviewer_ids,
        archived: false,
        created_at: crate::now_iso(),
    };
    snap.iterations.push(iteration.clone());
    if let Some(user) = snap.users.iter_mut().find(|user| user.id == actor.id) {
        user.current_iteration_id = Some(iteration.id.clone());
    }
    snap.push_event(
        Some(&actor.id),
        "iteration.created",
        None,
        Some(&iteration.id),
        json!({"code": iteration.code, "name": iteration.name}),
    );
    Ok(iteration)
}

pub fn update_iteration(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    input: IterationInput,
) -> Result<Iteration, ApiError> {
    require_plan(actor, "编辑迭代的")?;
    let index = snap
        .iterations
        .iter()
        .position(|iteration| iteration.id == id)
        .ok_or_else(|| ApiError::not_found("迭代不存在"))?;
    if let Some(name) = input.name {
        if !name.trim().is_empty() {
            snap.iterations[index].name = name.trim().to_string();
        }
    }
    if let Some(phase) = input.phase {
        if !phase.trim().is_empty() {
            snap.iterations[index].phase = phase.trim().to_string();
        }
    }
    if let Some(status) = input.status {
        if !["planning", "in_progress", "done"].contains(&status.as_str()) {
            return Err(ApiError::bad(
                "迭代状态只能是 planning / in_progress / done",
            ));
        }
        snap.iterations[index].status = status;
    }
    if input.start_date.is_some() {
        snap.iterations[index].start_date =
            validate_date(input.start_date.as_deref(), "开始日期")?;
    }
    if input.end_date.is_some() {
        snap.iterations[index].end_date = validate_date(input.end_date.as_deref(), "结束日期")?;
    }
    if let Some(reviewer_ids) = input.reviewer_ids {
        for reviewer in &reviewer_ids {
            let user = snap
                .active_user(reviewer)
                .ok_or_else(|| ApiError::bad(format!("会签人「{reviewer}」不存在或已停用")))?;
            if !user.can_plan() {
                return Err(ApiError::bad(format!(
                    "{} 不是负责人/管理员，不能作为会签人",
                    user.name
                )));
            }
        }
        snap.iterations[index].reviewer_ids = reviewer_ids;
    }
    let iteration = snap.iterations[index].clone();
    if !iteration.start_date.is_empty()
        && !iteration.end_date.is_empty()
        && iteration.start_date > iteration.end_date
    {
        return Err(ApiError::bad("开始日期不能晚于结束日期"));
    }
    snap.push_event(
        Some(&actor.id),
        "iteration.updated",
        None,
        Some(&iteration.id),
        json!({"code": iteration.code, "status": iteration.status}),
    );
    Ok(iteration)
}

pub fn select_iteration(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
) -> Result<Iteration, ApiError> {
    let iteration = snap
        .iterations
        .iter()
        .find(|iteration| iteration.id == id && !iteration.archived)
        .cloned()
        .ok_or_else(|| ApiError::not_found("迭代不存在或已归档"))?;
    if let Some(user) = snap.users.iter_mut().find(|user| user.id == actor.id) {
        user.current_iteration_id = Some(iteration.id.clone());
    }
    Ok(iteration)
}

pub fn archive_iteration(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    archived: bool,
) -> Result<Iteration, ApiError> {
    require_plan(actor, "归档迭代的")?;
    let index = snap
        .iterations
        .iter()
        .position(|iteration| iteration.id == id)
        .ok_or_else(|| ApiError::not_found("迭代不存在"))?;
    let active_count = snap.iterations.iter().filter(|item| !item.archived).count();
    if archived && active_count <= 1 {
        return Err(ApiError::conflict("至少要保留一个未归档迭代"));
    }
    snap.iterations[index].archived = archived;
    let iteration = snap.iterations[index].clone();
    if archived {
        for user in &mut snap.users {
            if user.current_iteration_id.as_deref() == Some(&iteration.id) {
                user.current_iteration_id = None;
            }
        }
    }
    snap.push_event(
        Some(&actor.id),
        if archived {
            "iteration.archived"
        } else {
            "iteration.restored"
        },
        None,
        Some(&iteration.id),
        json!({"code": iteration.code}),
    );
    Ok(iteration)
}

pub fn move_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    iteration_reference: &str,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "移动需求的")?;
    let index = req_index(snap, reference)?;
    if !matches!(
        snap.requirements[index].status.as_str(),
        STATUS_BACKLOG
            | STATUS_DRAFT
            | STATUS_PENDING_REVIEW
            | STATUS_CHANGES_REQUESTED
            | STATUS_APPROVED
            | STATUS_SCHEDULED
    ) {
        return Err(ApiError::conflict("开发开始后的需求不能跨迭代移动"));
    }
    let target = snap
        .iterations
        .iter()
        .find(|iteration| {
            !iteration.archived
                && (iteration.id == iteration_reference
                    || iteration.code.eq_ignore_ascii_case(iteration_reference))
        })
        .cloned()
        .ok_or_else(|| ApiError::not_found(format!("找不到迭代「{iteration_reference}」")))?;
    if target.id == snap.requirements[index].iteration_id {
        return Err(ApiError::conflict("需求已经在这个迭代里"));
    }
    let new_code = next_code(snap, &target);
    let old_code = snap.requirements[index].code.clone();
    let old_iteration = snap.requirements[index].iteration_id.clone();
    let owner = snap.requirements[index].owner_id.clone();
    let title = snap.requirements[index].title.clone();
    let requirement_id = snap.requirements[index].id.clone();
    let target_reviewers = if target.reviewer_ids.is_empty() {
        planner_ids(snap)
    } else {
        target.reviewer_ids.clone()
    };
    {
        let requirement = &mut snap.requirements[index];
        requirement.iteration_id = target.id.clone();
        requirement.code = new_code.clone();
        requirement.reviewer_ids = target_reviewers;
        requirement.updated_at = crate::now_iso();
    }
    snap.notify(
        &owner,
        "requirement.moved",
        Some(&requirement_id),
        &format!("{new_code} 需求已移动到 {}", target.code),
        &format!(
            "{old_code}「{title}」已移动到迭代 {}，编号改为 {new_code}。",
            target.code
        ),
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.moved",
        Some(&requirement_id),
        Some(&target.id),
        json!({"from": old_iteration, "to": target.id, "fromCode": old_code, "toCode": new_code}),
    );
    Ok(snap.requirements[index].clone())
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

pub fn create_requirement(
    snap: &mut Snapshot,
    actor: &User,
    title: &str,
) -> Result<(Requirement, Iteration), ApiError> {
    if !actor.can_create_requirement() {
        return Err(ApiError::forbidden(format!(
            "{} 没有创建需求的权限（需要产品/管理员身份）",
            actor.name
        )));
    }
    let title = title.trim();
    if title.is_empty() {
        return Err(ApiError::bad("需求名称不能为空"));
    }
    if title.chars().count() > 200 {
        return Err(ApiError::bad("需求名称不能超过 200 字"));
    }
    if title.chars().any(char::is_control) {
        return Err(ApiError::bad("需求名称不能包含控制字符"));
    }
    let iteration = snap
        .active_iteration(actor)
        .filter(|iteration| !iteration.archived)
        .cloned()
        .ok_or_else(|| ApiError::conflict("没有可用的迭代，请先创建迭代"))?;
    let code = next_code(snap, &iteration);
    let at = crate::now_iso();
    let requirement = Requirement {
        id: format!("req-{}", uuid::Uuid::new_v4()),
        code,
        title: title.to_string(),
        iteration_id: iteration.id.clone(),
        status: STATUS_CREATING.to_string(),
        design_status: DESIGN_UNCLAIMED.to_string(),
        platform_ids: default_platform_ids(snap, actor),
        owner_id: actor.id.clone(),
        designer_id: None,
        in_scope: false,
        versions: Vec::new(),
        design_versions: Vec::new(),
        reviews: Vec::new(),
        reviewer_ids: iteration.reviewer_ids.clone(),
        scope_changes: Vec::new(),
        sessions: Vec::new(),
        primary_session_id: None,
        planned_start_date: None,
        planned_end_date: None,
        scheduled_at: None,
        scheduled_by: None,
        design_delivered_at: None,
        design_updated_at: None,
        dev_tasks: Vec::new(),
        test_runs: Vec::new(),
        release: None,
        document: RequirementDocument::default(),
        artifacts: Vec::new(),
        create_error: None,
        created_at: at.clone(),
        updated_at: at,
    };
    snap.requirements.push(requirement.clone());
    snap.push_event(
        Some(&actor.id),
        "requirement.created",
        Some(&requirement.id),
        Some(&iteration.id),
        json!({"code": requirement.code, "title": requirement.title}),
    );
    Ok((requirement, iteration))
}

pub fn bind_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    session_record_id: Option<&str>,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference)?;
    let owner = snap.requirements[index].owner_id.clone();
    if owner != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden(format!(
            "{} 没有绑定这个需求的权限",
            actor.name
        )));
    }
    let status = snap.requirements[index].status.as_str();
    if !matches!(status, STATUS_CREATING | STATUS_CREATE_FAILED | STATUS_DRAFT) {
        return Err(ApiError::conflict("只有创建中、创建失败或草稿状态的需求可以绑定会话"));
    }
    let record_id = session_record_id.ok_or_else(|| ApiError::bad("缺少会话记录 id"))?;
    let record = snap.requirements[index]
        .session_record(record_id)
        .ok_or_else(|| ApiError::not_found("会话记录不存在"))?;
    if record.archived {
        return Err(ApiError::conflict("已归档的会话不能绑定为需求主会话"));
    }
    if record.kind != "requirement" {
        return Err(ApiError::bad("只有需求会话可以绑定为需求主会话"));
    }
    snap.requirements[index].primary_session_id = Some(record_id.to_string());
    snap.requirements[index].status = STATUS_DRAFT.to_string();
    snap.requirements[index].create_error = None;
    snap.requirements[index].updated_at = crate::now_iso();
    Ok(snap.requirements[index].clone())
}

pub fn mark_create_failed(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    message: &str,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference)?;
    let owner = snap.requirements[index].owner_id.clone();
    if owner != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden(format!(
            "{} 没有更新这个需求的权限",
            actor.name
        )));
    }
    let status = snap.requirements[index].status.as_str();
    if !matches!(status, STATUS_CREATING | STATUS_CREATE_FAILED) {
        return Err(ApiError::conflict("只有创建中或创建失败的需求可以记录创建失败"));
    }
    let message = message.trim();
    if message.chars().count() > 2000 {
        return Err(ApiError::bad("创建失败原因不能超过 2000 字"));
    }
    snap.requirements[index].status = STATUS_CREATE_FAILED.to_string();
    snap.requirements[index].create_error = Some(if message.is_empty() {
        "创建失败".to_string()
    } else {
        message.to_string()
    });
    snap.requirements[index].updated_at = crate::now_iso();
    Ok(snap.requirements[index].clone())
}

pub fn record_session(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    kind: &str,
    label: &str,
) -> Result<(Requirement, SessionRecord), ApiError> {
    let index = req_index(snap, reference)?;
    let kind = match kind {
        "design" | "review" | "dev" | "test" | "requirement" => kind,
        "" => "requirement",
        other => return Err(ApiError::bad(format!("不支持的会话类型：{other}"))),
    };
    let allowed = match kind {
        "design" => actor.can_design(),
        "dev" => actor.can_dev(),
        "test" => actor.can_test(),
        _ => actor.can_product(),
    };
    if !allowed {
        return Err(ApiError::forbidden(format!(
            "{} 没有创建{}会话的权限",
            actor.name,
            session_type_label(kind)
        )));
    }
    // 创建中的需求需要先落一条需求会话记录才能绑定；创建失败后重试同理。
    // 其他类型的会话必须等需求创建完成。
    if matches!(
        snap.requirements[index].status.as_str(),
        STATUS_CREATING | STATUS_CREATE_FAILED
    ) && kind != "requirement"
    {
        return Err(ApiError::conflict(
            "需求还在创建中或创建失败，先完成创建再创建其他会话",
        ));
    }
    let record = SessionRecord {
        id: format!("session-{}", uuid::Uuid::new_v4()),
        kind: kind.to_string(),
        label: if label.trim().is_empty() {
            session_type_label(kind).to_string()
        } else {
            label.trim().to_string()
        },
        created_by: Some(actor.id.clone()),
        created_at: crate::now_iso(),
        archived: false,
    };
    snap.requirements[index].sessions.push(record.clone());
    if snap.requirements[index].primary_session_id.is_none() {
        snap.requirements[index].primary_session_id = Some(record.id.clone());
    }
    snap.requirements[index].updated_at = crate::now_iso();
    Ok((snap.requirements[index].clone(), record))
}

pub fn archive_session(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    record_id: &str,
    archived: bool,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference)?;
    let position = snap.requirements[index]
        .sessions
        .iter()
        .position(|session| session.id == record_id)
        .ok_or_else(|| ApiError::not_found("会话记录不存在"))?;
    let created_by = snap.requirements[index].sessions[position].created_by.clone();
    if created_by.as_deref() != Some(actor.id.as_str()) && !actor.can_plan() {
        return Err(ApiError::forbidden("只有会话创建人或负责人可以归档/恢复会话"));
    }
    snap.requirements[index].sessions[position].archived = archived;
    if archived && snap.requirements[index].primary_session_id.as_deref() == Some(record_id) {
        snap.requirements[index].primary_session_id = snap.requirements[index]
            .sessions
            .iter()
            .find(|session| !session.archived)
            .map(|session| session.id.clone());
    }
    if !archived && snap.requirements[index].primary_session_id.is_none() {
        snap.requirements[index].primary_session_id = Some(record_id.to_string());
    }
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.push_event(
        Some(&actor.id),
        if archived {
            "requirement.session_archived"
        } else {
            "requirement.session_restored"
        },
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"sessionRecordId": record_id}),
    );
    Ok(requirement)
}

pub fn session_type_label(kind: &str) -> &'static str {
    match kind {
        "design" => "设计",
        "review" => "评审",
        "dev" => "开发",
        "test" => "测试",
        _ => "需求",
    }
}

pub fn submit_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    summary: Option<&str>,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference)?;
    check_not_creating(&snap.requirements[index], "提交")?;
    if !actor.can_product() {
        return Err(ApiError::forbidden(format!(
            "{} 没有提交需求的权限（需要产品/负责人/管理员身份）",
            actor.name
        )));
    }
    if snap.requirements[index].owner_id != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden("只有需求负责人或负责人/管理员可以提交这个需求"));
    }
    if !matches!(
        snap.requirements[index].status.as_str(),
        STATUS_DRAFT | STATUS_CHANGES_REQUESTED | STATUS_BACKLOG
    ) {
        return Err(ApiError::conflict("当前状态不能提交，只有草稿、待修改或已暂缓的需求可以提交"));
    }
    let version = snap.requirements[index].versions.len() as u32 + 1;
    let text = summary
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(String::from)
        .unwrap_or_else(|| format!("v{version} 提交"));
    snap.requirements[index].versions.push(Version {
        version,
        summary: text,
        at: crate::now_iso(),
        by: actor.id.clone(),
    });
    snap.requirements[index].status = STATUS_PENDING_REVIEW.to_string();
    snap.requirements[index].in_scope = false;
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    let reviewers = if requirement.reviewer_ids.is_empty() {
        planner_ids(snap)
    } else {
        requirement.reviewer_ids.clone()
    };
    for reviewer in reviewers {
        snap.notify(
            &reviewer,
            "review_requested",
            Some(&requirement.id),
            &format!("{} 等待评审", requirement.code),
            &format!(
                "{}「{}」已提交 v{}，请评审。",
                requirement.code, requirement.title, version
            ),
        );
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.submitted",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"code": requirement.code, "version": version}),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInput {
    pub decision: String,
    #[serde(default)]
    pub comment: String,
}

pub fn review_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: ReviewInput,
) -> Result<(Requirement, Review), ApiError> {
    let index = req_index(snap, reference)?;
    check_not_creating(&snap.requirements[index], "评审")?;
    if snap.requirements[index].status != STATUS_PENDING_REVIEW {
        return Err(ApiError::conflict(format!(
            "只有待评审的需求可以评审，当前是「{}」",
            status_label(&snap.requirements[index].status)
        )));
    }
    let reviewers = &snap.requirements[index].reviewer_ids;
    let allowed = actor.has_role(ROLE_ADMIN)
        || reviewers.contains(&actor.id)
        || (reviewers.is_empty() && actor.can_plan());
    if !allowed {
        return Err(ApiError::forbidden(format!(
            "{} 不在这个需求的会签人列表里",
            actor.name
        )));
    }
    let decision = match input.decision.as_str() {
        "approve" | "approved" | "通过" => "approved",
        "reject" | "rejected" | "退回" => "rejected",
        _ => return Err(ApiError::bad("decision 只能是 approve 或 reject")),
    };
    let round = snap.requirements[index].versions.len() as u32;
    if round == 0 {
        return Err(ApiError::conflict("需求还没有提交版本，不能评审"));
    }
    if snap.requirements[index]
        .reviews
        .iter()
        .any(|review| review.version == round && review.by == actor.id)
    {
        return Err(ApiError::conflict(format!(
            "{} 已经评审过当前版本 v{}",
            actor.name, round
        )));
    }
    let comment = input.comment.trim();
    if comment.chars().count() > 4000 {
        return Err(ApiError::bad("评审意见不能超过 4000 字"));
    }
    let review = Review {
        id: format!("review-{}", uuid::Uuid::new_v4()),
        version: round,
        decision: decision.to_string(),
        comment: comment.to_string(),
        at: crate::now_iso(),
        by: actor.id.clone(),
    };
    snap.requirements[index].reviews.push(review.clone());
    let reviewer_ids = snap.requirements[index].reviewer_ids.clone();
    let (rejected, approved_count) = {
        let mut rejected = false;
        let mut approved: HashSet<String> = HashSet::new();
        for item in snap.requirements[index]
            .reviews
            .iter()
            .filter(|item| item.version == round)
        {
            if item.decision == "rejected" {
                rejected = true;
            }
            if item.decision == "approved" {
                approved.insert(item.by.clone());
            }
        }
        (rejected, approved.len())
    };
    let all_approved = if reviewer_ids.is_empty() {
        decision == "approved"
    } else {
        let approved: HashSet<String> = snap.requirements[index]
            .reviews
            .iter()
            .filter(|item| item.version == round && item.decision == "approved")
            .map(|item| item.by.clone())
            .collect();
        reviewer_ids
            .iter()
            .all(|reviewer| approved.contains(reviewer))
    };
    if rejected {
        snap.requirements[index].status = STATUS_CHANGES_REQUESTED.to_string();
        snap.requirements[index].in_scope = false;
    } else if all_approved {
        snap.requirements[index].status = STATUS_APPROVED.to_string();
        snap.requirements[index].in_scope = true;
    } else {
        snap.requirements[index].status = STATUS_PENDING_REVIEW.to_string();
    }
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    let waiting = reviewer_ids.len().saturating_sub(approved_count);
    snap.notify(
        &requirement.owner_id,
        "review_updated",
        Some(&requirement.id),
        &format!(
            "{} 评审{}",
            requirement.code,
            if decision == "approved" {
                "通过"
            } else {
                "退回"
            }
        ),
        &format!(
            "{}「{}」：{} {}。{}",
            requirement.code,
            requirement.title,
            actor.name,
            if decision == "approved" {
                "通过"
            } else {
                "退回"
            },
            if requirement.status == STATUS_PENDING_REVIEW {
                format!("还有 {waiting} 位会签人待确认。")
            } else {
                format!("当前状态：{}。", status_label(&requirement.status))
            }
        ),
    );
    for reviewer in &reviewer_ids {
        if reviewer != &actor.id && requirement.status == STATUS_PENDING_REVIEW {
            snap.notify(
                reviewer,
                "review_requested",
                Some(&requirement.id),
                &format!("{} 等待你评审", requirement.code),
                &format!("仍有 {waiting} 位会签人待确认。"),
            );
        }
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.reviewed",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"decision": decision, "version": round, "status": requirement.status}),
    );
    Ok((requirement, review))
}

pub fn set_reviewers(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    reviewer_ids: Vec<String>,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "设置会签人的")?;
    let index = req_index(snap, reference)?;
    if snap.requirements[index].status != STATUS_PENDING_REVIEW {
        return Err(ApiError::conflict("只有待评审的需求可以设置会签人"));
    }
    let mut seen = HashSet::new();
    let mut clean = Vec::new();
    for id in reviewer_ids {
        if !seen.insert(id.clone()) {
            continue;
        }
        let user = snap
            .active_user(&id)
            .ok_or_else(|| ApiError::bad(format!("用户「{id}」不存在或已停用")))?;
        if !user.can_plan() {
            return Err(ApiError::bad(format!(
                "{} 不是负责人/管理员，不能作为会签人",
                user.name
            )));
        }
        clean.push(id);
    }
    let previous = snap.requirements[index].reviewer_ids.clone();
    let unchanged = previous.len() == clean.len()
        && previous.iter().all(|id| clean.contains(id));
    snap.requirements[index].reviewer_ids = clean.clone();
    let round = snap.requirements[index].versions.len() as u32;
    let mut approved: HashSet<String> = HashSet::new();
    let mut rejected = false;
    for review in snap.requirements[index]
        .reviews
        .iter()
        .filter(|review| review.version == round && clean.contains(&review.by))
    {
        if review.decision == "rejected" {
            rejected = true;
        } else if review.decision == "approved" {
            approved.insert(review.by.clone());
        }
    }
    if rejected {
        snap.requirements[index].status = STATUS_CHANGES_REQUESTED.to_string();
        snap.requirements[index].in_scope = false;
    } else if !clean.is_empty() && clean.iter().all(|id| approved.contains(id)) {
        snap.requirements[index].status = STATUS_APPROVED.to_string();
        snap.requirements[index].in_scope = true;
    } else {
        snap.requirements[index].status = STATUS_PENDING_REVIEW.to_string();
    }
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    for reviewer in if unchanged { Vec::new() } else { clean } {
        snap.notify(
            &reviewer,
            "review_requested",
            Some(&requirement.id),
            &format!("{} 等待你评审", requirement.code),
            &format!(
                "{}「{}」已提交会签，请评审。",
                requirement.code, requirement.title
            ),
        );
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.reviewers_set",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"reviewerIds": requirement.reviewer_ids}),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleInput {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

pub fn schedule_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: ScheduleInput,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "排期需求的")?;
    let index = req_index(snap, reference)?;
    check_not_creating(&snap.requirements[index], "排期")?;
    ensure_status(
        &snap.requirements[index],
        &[STATUS_APPROVED, STATUS_SCHEDULED],
        "排期",
    )?;
    if !snap.requirements[index].in_scope {
        return Err(ApiError::conflict(
            "需求不在本期范围内，先用范围调整纳入",
        ));
    }
    let start = match input.start_date.as_deref() {
        Some(value) => Some(validate_date(Some(value), "开始日期")?),
        None => snap.requirements[index].planned_start_date.clone(),
    };
    let end = match input.end_date.as_deref() {
        Some(value) => Some(validate_date(Some(value), "结束日期")?),
        None => snap.requirements[index].planned_end_date.clone(),
    };
    if start.as_deref().unwrap_or("").is_empty() && end.as_deref().unwrap_or("").is_empty() {
        return Err(ApiError::bad("至少给出开始日期或结束日期"));
    }
    if let (Some(start), Some(end)) = (&start, &end) {
        if !start.is_empty() && !end.is_empty() && start > end {
            return Err(ApiError::bad("开始日期不能晚于结束日期"));
        }
    }
    snap.requirements[index].planned_start_date = start.filter(|value| !value.is_empty());
    snap.requirements[index].planned_end_date = end.filter(|value| !value.is_empty());
    if snap.requirements[index].status == STATUS_APPROVED {
        snap.requirements[index].status = STATUS_SCHEDULED.to_string();
    }
    snap.requirements[index].scheduled_at = Some(crate::now_iso());
    snap.requirements[index].scheduled_by = Some(actor.id.clone());
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.notify(
        &requirement.owner_id,
        "requirement.scheduled",
        Some(&requirement.id),
        &format!("{} 已排期", requirement.code),
        &format!(
            "计划 {} ~ {}。",
            requirement.planned_start_date.as_deref().unwrap_or("待定"),
            requirement.planned_end_date.as_deref().unwrap_or("待定")
        ),
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.scheduled",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({
            "startDate": requirement.planned_start_date,
            "endDate": requirement.planned_end_date
        }),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeInput {
    pub in_scope: bool,
    #[serde(default)]
    pub reason: String,
}

pub fn set_scope(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: ScopeInput,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "调整需求范围的")?;
    let index = req_index(snap, reference)?;
    ensure_status(
        &snap.requirements[index],
        &[
            STATUS_APPROVED,
            STATUS_SCHEDULED,
            STATUS_IN_PROGRESS,
            STATUS_DEV_DONE,
            STATUS_TESTING,
            STATUS_TEST_FAILED,
            STATUS_TEST_PASSED,
            STATUS_FROZEN,
            STATUS_BACKLOG,
        ],
        "调整范围",
    )?;
    if snap.requirements[index].in_scope == input.in_scope {
        return Err(ApiError::conflict(if input.in_scope {
            "需求已经在当前范围内"
        } else {
            "需求已经在范围外"
        }));
    }
    let at = crate::now_iso();
    snap.requirements[index].in_scope = input.in_scope;
    snap.requirements[index]
        .scope_changes
        .push(ScopeChange {
            at: at.clone(),
            by: actor.id.clone(),
            in_scope: input.in_scope,
            reason: input.reason.trim().to_string(),
        });
    snap.requirements[index].status = if input.in_scope {
        if snap.requirements[index].planned_start_date.is_some()
            || snap.requirements[index].planned_end_date.is_some()
        {
            STATUS_SCHEDULED.to_string()
        } else {
            STATUS_APPROVED.to_string()
        }
    } else {
        STATUS_BACKLOG.to_string()
    };
    snap.requirements[index].updated_at = at;
    let requirement = snap.requirements[index].clone();
    snap.notify(
        &requirement.owner_id,
        "requirement.scope_changed",
        Some(&requirement.id),
        &format!(
            "{} {}本期范围",
            requirement.code,
            if input.in_scope { "纳入" } else { "移出" }
        ),
        &format!(
            "{}。当前状态：{}。",
            input.reason.trim(),
            status_label(&requirement.status)
        ),
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.scope_changed",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"inScope": input.in_scope, "reason": input.reason}),
    );
    Ok(requirement)
}

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

pub fn claim_design(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    if !actor.can_design() {
        return Err(ApiError::forbidden(format!(
            "{} 没有认领设计的权限（需要设计/负责人/管理员身份）",
            actor.name
        )));
    }
    let index = req_index(snap, reference)?;
    check_not_creating(&snap.requirements[index], "认领设计")?;
    match snap.requirements[index].design_status.as_str() {
        DESIGN_NONE => return Err(ApiError::conflict("该需求标记为无需设计")),
        DESIGN_DELIVERED => return Err(ApiError::conflict("该需求设计已交付")),
        DESIGN_DESIGNING => {
            if let Some(holder) = &snap.requirements[index].designer_id {
                if holder != &actor.id {
                    return Err(ApiError::conflict(format!(
                        "设计已由 {} 认领",
                        user_name(snap, holder)
                    )));
                }
            }
        }
        _ => {}
    }
    snap.requirements[index].designer_id = Some(actor.id.clone());
    snap.requirements[index].design_status = DESIGN_DESIGNING.to_string();
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.push_event(
        Some(&actor.id),
        "design.claimed",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"designer": actor.id}),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliverDesignInput {
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub artifact_ids: Vec<String>,
}

pub fn deliver_design(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: DeliverDesignInput,
) -> Result<Requirement, ApiError> {
    if !actor.can_design() {
        return Err(ApiError::forbidden(format!(
            "{} 没有交付设计的权限（需要设计/负责人/管理员身份）",
            actor.name
        )));
    }
    let index = req_index(snap, reference)?;
    check_not_creating(&snap.requirements[index], "交付设计")?;
    if snap.requirements[index].design_status == DESIGN_NONE {
        return Err(ApiError::conflict("该需求标记为无需设计"));
    }
    if ![
        DESIGN_DESIGNING,
        DESIGN_DELIVERED,
        DESIGN_CHANGES,
    ]
    .contains(&snap.requirements[index].design_status.as_str())
    {
        return Err(ApiError::conflict("请先认领设计，再交付"));
    }
    if let Some(holder) = &snap.requirements[index].designer_id {
        if holder != &actor.id && !actor.can_plan() {
            return Err(ApiError::conflict(format!(
                "设计由 {} 认领，不能由 {} 交付",
                user_name(snap, holder),
                actor.name
            )));
        }
    }
    let version = snap.requirements[index].design_versions.len() as u32 + 1;
    let summary = if input.summary.trim().is_empty() {
        format!("d{version} 设计交付")
    } else {
        input.summary.trim().to_string()
    };
    let at = crate::now_iso();
    let dev_started = snap.requirements[index].dev_started();
    let valid_ids: HashSet<String> = snap.requirements[index]
        .artifacts
        .iter()
        .map(|artifact| artifact.id.clone())
        .collect();
    let artifact_ids: Vec<String> = input
        .artifact_ids
        .into_iter()
        .filter(|id| valid_ids.contains(id))
        .take(200)
        .collect();
    for artifact in &mut snap.requirements[index].artifacts {
        if artifact_ids.iter().any(|id| id == &artifact.id) {
            artifact.design_version = Some(format!("d{version}"));
        }
    }
    snap.requirements[index]
        .design_versions
        .push(DesignVersion {
            version,
            summary,
            at: at.clone(),
            by: actor.id.clone(),
            files: input.files.into_iter().take(100).collect(),
            artifact_ids,
        });
    snap.requirements[index].design_status = DESIGN_DELIVERED.to_string();
    if version > 1 || dev_started {
        snap.requirements[index].design_updated_at = Some(at.clone());
    }
    snap.requirements[index].design_delivered_at = Some(at.clone());
    snap.requirements[index].updated_at = at;
    let requirement = snap.requirements[index].clone();
    if dev_started {
        for assignee in dev_assignee_ids(&requirement) {
            snap.notify(
                &assignee,
                "design_updated",
                Some(&requirement.id),
                &format!("{} 设计已更新", requirement.code),
                &format!(
                    "开发已开始后交付了 d{}，请同步查看最新设计。",
                    requirement.design_versions.len()
                ),
            );
        }
        snap.notify(
            &requirement.owner_id,
            "design_updated",
            Some(&requirement.id),
            &format!("{} 设计已更新", requirement.code),
            "开发开始后设计有新版本，研发侧需要同步。",
        );
    }
    snap.push_event(
        Some(&actor.id),
        "design.delivered",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({
            "version": requirement.design_versions.len(),
            "late": dev_started || requirement.design_versions.len() > 1
        }),
    );
    Ok(requirement)
}

// ---------------------------------------------------------------------------
// Development / testing / release
// ---------------------------------------------------------------------------

fn check_dev_status(requirement: &Requirement, action: &str) -> Result<(), ApiError> {
    ensure_status(
        requirement,
        &[
            STATUS_APPROVED,
            STATUS_SCHEDULED,
            STATUS_IN_PROGRESS,
            STATUS_DEV_DONE,
            STATUS_TEST_FAILED,
            STATUS_TEST_PASSED,
        ],
        action,
    )
}

fn check_platform(requirement: &Requirement, platform_id: &str) -> Result<(), ApiError> {
    if !requirement.platform_ids.iter().any(|id| id == platform_id) {
        return Err(ApiError::bad("这个平台不在需求范围内"));
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevAssignInput {
    pub platform_id: String,
    pub assignee_id: String,
}

pub fn dev_assign(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: DevAssignInput,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "指派开发的")?;
    let index = req_index(snap, reference)?;
    check_dev_status(&snap.requirements[index], "指派开发")?;
    check_platform(&snap.requirements[index], &input.platform_id)?;
    let assignee = snap
        .active_user(&input.assignee_id)
        .ok_or_else(|| ApiError::bad("开发负责人不存在或已停用"))?;
    if !(assignee.has_role(ROLE_DEV) || assignee.can_plan()) {
        return Err(ApiError::bad(format!(
            "{} 没有开发身份，不能指派为开发负责人",
            assignee.name
        )));
    }
    let assignee_name = assignee.name.clone();
    snap.requirements[index].ensure_dev_tasks();
    if snap.requirements[index]
        .dev_tasks
        .iter()
        .any(|task| task.platform_id == input.platform_id && task.status == DEV_DONE)
    {
        return Err(ApiError::conflict("开发任务已完成，请先重开再改派"));
    }
    if let Some(task) = snap.requirements[index].dev_task_mut(&input.platform_id) {
        task.assignee_id = Some(input.assignee_id.clone());
        if task.status == DEV_UNASSIGNED {
            task.status = DEV_ASSIGNED.to_string();
        }
    }
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.notify(
        &input.assignee_id,
        "dev_assigned",
        Some(&requirement.id),
        &format!("{} 指派了开发任务", requirement.code),
        &format!(
            "{}「{}」的 {} 平台开发任务指派给你。",
            requirement.code, requirement.title, input.platform_id
        ),
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.dev_assigned",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"platformId": input.platform_id, "assigneeId": input.assignee_id, "assignee": assignee_name}),
    );
    Ok(requirement)
}

pub fn dev_claim(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    platform_id: &str,
) -> Result<Requirement, ApiError> {
    if !actor.can_dev() {
        return Err(ApiError::forbidden(format!(
            "{} 没有认领开发的权限（需要开发/负责人/管理员身份）",
            actor.name
        )));
    }
    if !actor.can_plan()
        && !actor.platforms.is_empty()
        && !actor.owns_platform(platform_id)
    {
        return Err(ApiError::forbidden(format!(
            "{} 不负责这个平台",
            actor.name
        )));
    }
    let index = req_index(snap, reference)?;
    check_dev_status(&snap.requirements[index], "认领开发")?;
    check_platform(&snap.requirements[index], platform_id)?;
    snap.requirements[index].ensure_dev_tasks();
    let holder = snap.requirements[index]
        .dev_tasks
        .iter()
        .find(|task| task.platform_id == platform_id)
        .and_then(|task| task.assignee_id.clone());
    if let Some(assignee) = holder {
        if assignee != actor.id && !actor.can_plan() {
            return Err(ApiError::forbidden(format!(
                "这个平台已指派给 {}",
                user_name(snap, &assignee)
            )));
        }
    }
    if snap.requirements[index]
        .dev_tasks
        .iter()
        .any(|task| task.platform_id == platform_id && task.status == DEV_DONE)
    {
        return Err(ApiError::conflict("开发任务已完成，请先重开再认领"));
    }
    if let Some(task) = snap.requirements[index].dev_task_mut(platform_id) {
        task.assignee_id = Some(actor.id.clone());
        if task.status == DEV_UNASSIGNED {
            task.status = DEV_ASSIGNED.to_string();
        }
    }
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.push_event(
        Some(&actor.id),
        "requirement.dev_claimed",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"platformId": platform_id}),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevActionInput {
    pub platform_id: String,
    #[serde(default)]
    pub note: String,
}

pub fn dev_start(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    platform_id: &str,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference)?;
    check_dev_status(&snap.requirements[index], "开始开发")?;
    check_platform(&snap.requirements[index], platform_id)?;
    if !snap.requirements[index].in_scope {
        return Err(ApiError::conflict("需求不在本期范围内，不能开始开发"));
    }
    snap.requirements[index].ensure_dev_tasks();
    let assignee = snap.requirements[index]
        .dev_tasks
        .iter()
        .find(|task| task.platform_id == platform_id)
        .and_then(|task| task.assignee_id.clone());
    let allowed = actor.can_plan() || assignee.as_deref() == Some(actor.id.as_str());
    if !allowed {
        return Err(ApiError::forbidden(format!(
            "{} 不是这个平台任务的负责人",
            actor.name
        )));
    }
    let at = crate::now_iso();
    let first_start = snap.requirements[index].status != STATUS_IN_PROGRESS;
    if let Some(task) = snap.requirements[index].dev_task_mut(platform_id) {
        if task.assignee_id.is_none() {
            task.assignee_id = Some(actor.id.clone());
        }
        task.status = DEV_IN_PROGRESS.to_string();
        if task.started_at.is_none() {
            task.started_at = Some(at.clone());
        }
        task.finished_at = None;
        task.pipeline_status = Some("running".to_string());
    }
    snap.requirements[index].status = STATUS_IN_PROGRESS.to_string();
    snap.requirements[index].in_scope = true;
    snap.requirements[index].updated_at = at;
    let requirement = snap.requirements[index].clone();
    if first_start && requirement.design_status != DESIGN_DELIVERED && requirement.design_status != DESIGN_NONE {
        snap.notify(
            &requirement.owner_id,
            "design_pending",
            Some(&requirement.id),
            &format!("{} 开发已开始，设计未交付", requirement.code),
            "开发开始后交付的设计会标记为「设计已更新」。",
        );
        if let Some(designer) = requirement.designer_id.as_deref().filter(|id| *id != requirement.owner_id.as_str()) {
            snap.notify(
                designer,
                "design_pending",
                Some(&requirement.id),
                &format!("{} 开发已开始", requirement.code),
                "研发已经进入开发，请尽快交付设计。",
            );
        }
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.dev_started",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"platformId": platform_id}),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevFinishInput {
    pub platform_id: String,
    #[serde(default)]
    pub note: String,
}

pub fn dev_finish(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: DevFinishInput,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference)?;
    check_dev_status(&snap.requirements[index], "完成开发")?;
    check_platform(&snap.requirements[index], &input.platform_id)?;
    snap.requirements[index].ensure_dev_tasks();
    let assignee = snap.requirements[index]
        .dev_tasks
        .iter()
        .find(|task| task.platform_id == input.platform_id)
        .and_then(|task| task.assignee_id.clone());
    if !actor.can_plan() && assignee.as_deref() != Some(actor.id.as_str()) {
        return Err(ApiError::forbidden(format!(
            "{} 不是这个平台任务的负责人",
            actor.name
        )));
    }
    let at = crate::now_iso();
    let code = snap.requirements[index].code.clone();
    let platform_id = input.platform_id.clone();
    let task_count = snap.requirements[index].dev_tasks.len();
    if let Some(task) = snap.requirements[index].dev_task_mut(&input.platform_id) {
        if task.status != DEV_IN_PROGRESS {
            return Err(ApiError::conflict("这个平台任务还没有开始开发"));
        }
        task.status = DEV_DONE.to_string();
        task.finished_at = Some(at.clone());
        task.note = input.note.trim().to_string();
        task.branch = Some(format!("feature/{}-{}", code.to_lowercase(), platform_id));
        task.mr_url = Some(format!(
            "https://gitlab.example.com/member/workbench/-/merge_requests/{}",
            300 + task_count
        ));
        task.pipeline_status = Some("success".to_string());
        task.pipeline_url = Some(format!(
            "https://gitlab.example.com/member/workbench/-/pipelines/{}",
            9000 + task_count
        ));
    }
    if snap.requirements[index].all_dev_done() {
        snap.requirements[index].status = STATUS_DEV_DONE.to_string();
    }
    snap.requirements[index].updated_at = at;
    let requirement = snap.requirements[index].clone();
    if requirement.status == STATUS_DEV_DONE {
        for qa in qa_ids(snap) {
            snap.notify(
                &qa,
                "test_requested",
                Some(&requirement.id),
                &format!("{} 待测试", requirement.code),
                &format!(
                    "{}「{}」所有平台开发完成，请开始测试。",
                    requirement.code, requirement.title
                ),
            );
        }
        snap.notify(
            &requirement.owner_id,
            "dev_done",
            Some(&requirement.id),
            &format!("{} 开发完成", requirement.code),
            "所有平台开发任务已完成，进入待测试。",
        );
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.dev_finished",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"platformId": input.platform_id, "allDone": requirement.status == STATUS_DEV_DONE}),
    );
    Ok(requirement)
}

pub fn dev_reopen(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    platform_id: &str,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference)?;
    ensure_status(
        &snap.requirements[index],
        &[
            STATUS_IN_PROGRESS,
            STATUS_DEV_DONE,
            STATUS_TEST_FAILED,
            STATUS_TEST_PASSED,
        ],
        "重新打开开发",
    )?;
    check_platform(&snap.requirements[index], platform_id)?;
    snap.requirements[index].ensure_dev_tasks();
    let assignee = snap.requirements[index]
        .dev_tasks
        .iter()
        .find(|task| task.platform_id == platform_id)
        .and_then(|task| task.assignee_id.clone());
    if !actor.can_plan() && assignee.as_deref() != Some(actor.id.as_str()) {
        return Err(ApiError::forbidden(format!(
            "{} 不是这个平台任务的负责人",
            actor.name
        )));
    }
    if let Some(task) = snap.requirements[index].dev_task_mut(platform_id) {
        task.status = DEV_IN_PROGRESS.to_string();
        task.finished_at = None;
        task.pipeline_status = Some("running".to_string());
        if task.started_at.is_none() {
            task.started_at = Some(crate::now_iso());
        }
    }
    snap.requirements[index].status = STATUS_IN_PROGRESS.to_string();
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.push_event(
        Some(&actor.id),
        "requirement.dev_reopened",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"platformId": platform_id}),
    );
    Ok(requirement)
}

pub fn test_start(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    if !actor.can_test() {
        return Err(ApiError::forbidden(format!(
            "{} 没有开始测试的权限（需要测试/负责人/管理员身份）",
            actor.name
        )));
    }
    let index = req_index(snap, reference)?;
    ensure_status(
        &snap.requirements[index],
        &[STATUS_DEV_DONE, STATUS_TEST_FAILED, STATUS_TEST_PASSED],
        "开始测试",
    )?;
    if !snap.requirements[index].all_dev_done() {
        return Err(ApiError::conflict("还有平台没有完成开发"));
    }
    let at = crate::now_iso();
    snap.requirements[index].test_runs.push(TestRun {
        id: format!("test-{}", uuid::Uuid::new_v4()),
        status: "running".to_string(),
        started_at: at.clone(),
        finished_at: None,
        by: actor.id.clone(),
        note: String::new(),
        bug_url: None,
    });
    snap.requirements[index].status = STATUS_TESTING.to_string();
    snap.requirements[index].updated_at = at;
    let requirement = snap.requirements[index].clone();
    snap.notify(
        &requirement.owner_id,
        "test_started",
        Some(&requirement.id),
        &format!("{} 开始测试", requirement.code),
        &format!("{} 开始测试验证。", actor.name),
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.test_started",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({}),
    );
    Ok(requirement)
}

fn clean_http_url(raw: Option<&str>, label: &str) -> Result<Option<String>, ApiError> {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value.len() > 2000 {
        return Err(ApiError::bad(format!("{label}过长（最多 2000 字符）")));
    }
    let parsed = reqwest::Url::parse(value)
        .map_err(|_| ApiError::bad(format!("{label}不是合法 URL")))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(ApiError::bad(format!("{label}只支持 http/https")));
    }
    Ok(Some(value.to_string()))
}

fn finish_test(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    passed: bool,
    note: &str,
    bug_url: Option<&str>,
) -> Result<Requirement, ApiError> {
    if !actor.can_test() {
        return Err(ApiError::forbidden(format!(
            "{} 没有提交测试结论的权限（需要测试/负责人/管理员身份）",
            actor.name
        )));
    }
    let note = note.trim();
    if note.chars().count() > 4000 {
        return Err(ApiError::bad("测试说明不能超过 4000 字"));
    }
    let bug_url = clean_http_url(bug_url, "缺陷链接")?;
    let index = req_index(snap, reference)?;
    if snap.requirements[index].status != STATUS_TESTING {
        return Err(ApiError::conflict("需求不在测试中"));
    }
    let at = crate::now_iso();
    if let Some(run) = snap.requirements[index].test_runs.last_mut() {
        if run.status != "running" {
            return Err(ApiError::conflict("当前没有进行中的测试轮次"));
        }
        run.status = if passed { "passed" } else { "failed" }.to_string();
        run.finished_at = Some(at.clone());
        run.note = note.to_string();
        run.bug_url = bug_url.clone();
    } else {
        return Err(ApiError::conflict("当前没有测试轮次"));
    }
    snap.requirements[index].status = if passed {
        STATUS_TEST_PASSED.to_string()
    } else {
        STATUS_TEST_FAILED.to_string()
    };
    snap.requirements[index].updated_at = at;
    let requirement = snap.requirements[index].clone();
    if passed {
        snap.notify(
            &requirement.owner_id,
            "test_passed",
            Some(&requirement.id),
            &format!("{} 测试通过", requirement.code),
            "测试通过，可以进入冻结与发布。",
        );
        for planner in planner_ids(snap) {
            if planner == requirement.owner_id {
                continue;
            }
            snap.notify(
                &planner,
                "test_passed",
                Some(&requirement.id),
                &format!("{} 测试通过", requirement.code),
                "可以进入冻结与发布。",
            );
        }
    } else {
        for assignee in dev_assignee_ids(&requirement) {
            snap.notify(
                &assignee,
                "test_failed",
                Some(&requirement.id),
                &format!("{} 测试不通过", requirement.code),
                &format!("{}。请修复后重新提交测试。", note.trim()),
            );
        }
        snap.notify(
            &requirement.owner_id,
            "test_failed",
            Some(&requirement.id),
            &format!("{} 测试不通过", requirement.code),
            &format!("{}。", note.trim()),
        );
    }
    snap.push_event(
        Some(&actor.id),
        if passed {
            "requirement.test_passed"
        } else {
            "requirement.test_failed"
        },
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"note": note, "bugUrl": bug_url}),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResultInput {
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub bug_url: Option<String>,
}

pub fn test_pass(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: TestResultInput,
) -> Result<Requirement, ApiError> {
    finish_test(snap, actor, reference, true, &input.note, None)
}

pub fn test_fail(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: TestResultInput,
) -> Result<Requirement, ApiError> {
    finish_test(
        snap,
        actor,
        reference,
        false,
        &input.note,
        input.bug_url.as_deref(),
    )
}

pub fn freeze(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "冻结需求的")?;
    let index = req_index(snap, reference)?;
    if snap.requirements[index].status != STATUS_TEST_PASSED {
        return Err(ApiError::conflict("只有测试通过的需求可以冻结"));
    }
    snap.requirements[index].status = STATUS_FROZEN.to_string();
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.notify(
        &requirement.owner_id,
        "requirement.frozen",
        Some(&requirement.id),
        &format!("{} 已冻结", requirement.code),
        "需求已冻结，可以准备发布。",
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.frozen",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({}),
    );
    Ok(requirement)
}

pub fn unfreeze(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "解冻需求的")?;
    let index = req_index(snap, reference)?;
    if snap.requirements[index].status != STATUS_FROZEN {
        return Err(ApiError::conflict("只有已冻结的需求可以解冻"));
    }
    snap.requirements[index].status = STATUS_TEST_PASSED.to_string();
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.push_event(
        Some(&actor.id),
        "requirement.unfrozen",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({}),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInput {
    #[serde(default)]
    pub version: String,
}

pub fn release(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: ReleaseInput,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "发布需求的")?;
    let index = req_index(snap, reference)?;
    if snap.requirements[index].status != STATUS_FROZEN {
        return Err(ApiError::conflict("只有已冻结的需求可以发布"));
    }
    let version = if input.version.trim().is_empty() {
        "v1.0.0".to_string()
    } else {
        input.version.trim().to_string()
    };
    snap.requirements[index].status = STATUS_RELEASED.to_string();
    snap.requirements[index].release = Some(ReleaseInfo {
        version: version.clone(),
        at: crate::now_iso(),
        by: actor.id.clone(),
    });
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.notify(
        &requirement.owner_id,
        "requirement.released",
        Some(&requirement.id),
        &format!("{} 已发布 {}", requirement.code, version),
        "发布记录已写入需求历史。",
    );
    let iteration_owner = snap
        .iteration(&requirement.iteration_id)
        .and_then(|iteration| iteration.owner_id.clone());
    if let Some(owner) = iteration_owner.filter(|id| id != &requirement.owner_id) {
        snap.notify(
            &owner,
            "requirement.released",
            Some(&requirement.id),
            &format!("{} 已发布 {}", requirement.code, version),
            "发布记录已写入需求历史。",
        );
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.released",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"version": version}),
    );
    Ok(requirement)
}

// ---------------------------------------------------------------------------
// Platform configuration
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformGroupInput {
    pub name: Option<String>,
    pub order: Option<i64>,
    pub active: Option<bool>,
    pub supports_api_doc: Option<bool>,
}

pub fn create_platform_group(
    snap: &mut Snapshot,
    actor: &User,
    input: PlatformGroupInput,
) -> Result<PlatformGroup, ApiError> {
    require_plan(actor, "配置平台的")?;
    let name = input.name.unwrap_or_default().trim().to_string();
    if name.is_empty() {
        return Err(ApiError::bad("平台组名称不能为空"));
    }
    let id = make_entity_id(
        snap.groups.iter().map(|item| item.id.as_str()),
        "group",
        &name,
    );
    let group = PlatformGroup {
        id,
        name,
        order: input.order.unwrap_or_else(|| {
            next_order(&snap.groups, |item| item.order)
        }),
        active: input.active.unwrap_or(true),
        supports_api_doc: input.supports_api_doc.unwrap_or(false),
    };
    snap.groups.push(group.clone());
    snap.push_event(
        Some(&actor.id),
        "platform_group.created",
        None,
        None,
        json!({"id": group.id, "name": group.name}),
    );
    Ok(group)
}

pub fn update_platform_group(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    input: PlatformGroupInput,
) -> Result<PlatformGroup, ApiError> {
    require_plan(actor, "配置平台的")?;
    let index = snap
        .groups
        .iter()
        .position(|group| group.id == id)
        .ok_or_else(|| ApiError::not_found("平台组不存在"))?;
    if let Some(name) = input.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(ApiError::bad("平台组名称不能为空"));
        }
        snap.groups[index].name = name;
    }
    if let Some(order) = input.order {
        snap.groups[index].order = order;
    }
    if let Some(active) = input.active {
        snap.groups[index].active = active;
    }
    if let Some(doc) = input.supports_api_doc {
        snap.groups[index].supports_api_doc = doc;
    }
    Ok(snap.groups[index].clone())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInput {
    pub name: Option<String>,
    pub short_name: Option<String>,
    pub group_id: Option<String>,
    pub order: Option<i64>,
    pub active: Option<bool>,
    pub owner_id: Option<String>,
    pub lead_ids: Option<Vec<String>>,
    pub gitlab_project_id: Option<String>,
    pub gitlab_project_path: Option<String>,
}

pub fn create_platform(
    snap: &mut Snapshot,
    actor: &User,
    input: PlatformInput,
) -> Result<Platform, ApiError> {
    require_plan(actor, "配置平台的")?;
    let name = input.name.unwrap_or_default().trim().to_string();
    if name.is_empty() {
        return Err(ApiError::bad("平台名称不能为空"));
    }
    let group_id = input
        .group_id
        .ok_or_else(|| ApiError::bad("请选择平台组"))?;
    let group = snap
        .groups
        .iter()
        .find(|group| group.id == group_id)
        .ok_or_else(|| ApiError::bad("平台组不存在"))?;
    if !group.active {
        return Err(ApiError::conflict("不能往已归档的平台组里添加平台"));
    }
    let id = make_entity_id(
        snap.platforms.iter().map(|item| item.id.as_str()),
        "platform",
        &name,
    );
    let short_name = input
        .short_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| name.clone());
    let order = input.order.unwrap_or_else(|| {
        next_order(
            &snap.platforms
                .iter()
                .filter(|platform| platform.group_id == group_id)
                .collect::<Vec<_>>(),
            |item| item.order,
        )
    });
    let platform = Platform {
        id,
        group_id,
        name,
        short_name,
        order,
        active: input.active.unwrap_or(true),
        owner_id: input.owner_id,
        lead_ids: input.lead_ids.unwrap_or_default(),
        gitlab_project_id: input.gitlab_project_id,
        gitlab_project_path: input.gitlab_project_path,
    };
    snap.platforms.push(platform.clone());
    Ok(platform)
}

pub fn update_platform(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    input: PlatformInput,
) -> Result<Platform, ApiError> {
    require_plan(actor, "配置平台的")?;
    let index = snap
        .platforms
        .iter()
        .position(|platform| platform.id == id)
        .ok_or_else(|| ApiError::not_found("平台不存在"))?;
    if let Some(name) = input.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(ApiError::bad("平台名称不能为空"));
        }
        snap.platforms[index].name = name;
    }
    if let Some(short_name) = input.short_name {
        let short_name = short_name.trim().to_string();
        if short_name.is_empty() {
            return Err(ApiError::bad("平台简称不能为空"));
        }
        snap.platforms[index].short_name = short_name;
    }
    if let Some(group_id) = input.group_id {
        if group_id != snap.platforms[index].group_id {
            let group = snap
                .groups
                .iter()
                .find(|group| group.id == group_id)
                .ok_or_else(|| ApiError::bad("平台组不存在"))?;
            if !group.active {
                return Err(ApiError::conflict("不能移动到已归档的平台组"));
            }
            snap.platforms[index].group_id = group_id;
        }
    }
    if let Some(order) = input.order {
        snap.platforms[index].order = order;
    }
    if let Some(active) = input.active {
        snap.platforms[index].active = active;
    }
    if input.owner_id.is_some() {
        snap.platforms[index].owner_id = input.owner_id.filter(|id| !id.trim().is_empty());
    }
    if let Some(lead_ids) = input.lead_ids {
        snap.platforms[index].lead_ids = lead_ids;
    }
    if input.gitlab_project_id.is_some() {
        snap.platforms[index].gitlab_project_id = input
            .gitlab_project_id
            .filter(|id| !id.trim().is_empty());
    }
    if input.gitlab_project_path.is_some() {
        snap.platforms[index].gitlab_project_path = input
            .gitlab_project_path
            .filter(|path| !path.trim().is_empty());
    }
    Ok(snap.platforms[index].clone())
}

pub fn archive_platform(
    snap: &mut Snapshot,
    actor: &User,
    table: &str,
    id: &str,
    active: bool,
) -> Result<(), ApiError> {
    require_plan(actor, "归档平台的")?;
    if table == "platform-groups" {
        let group = snap
            .groups
            .iter_mut()
            .find(|group| group.id == id)
            .ok_or_else(|| ApiError::not_found("平台组不存在"))?;
        group.active = active;
    } else {
        let platform = snap
            .platforms
            .iter_mut()
            .find(|platform| platform.id == id)
            .ok_or_else(|| ApiError::not_found("平台不存在"))?;
        platform.active = active;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingInput {
    pub active_role: Option<String>,
    #[serde(default)]
    pub platform_ids: Option<Vec<String>>,
    #[serde(default)]
    pub folder_configured: Option<bool>,
}

pub fn complete_onboarding(
    snap: &mut Snapshot,
    actor: &User,
    input: OnboardingInput,
) -> Result<User, ApiError> {
    let index = snap
        .users
        .iter()
        .position(|user| user.id == actor.id)
        .ok_or_else(|| ApiError::not_found("用户不存在"))?;
    let role = input
        .active_role
        .filter(|value| !value.is_empty())
        .or_else(|| snap.users[index].active_role.clone())
        .or_else(|| snap.users[index].roles.first().cloned());
    if let Some(role) = &role {
        if !snap.users[index].has_role(role) {
            return Err(ApiError::bad(format!("当前账号没有「{role}」身份")));
        }
    }
    let active_ids: HashSet<String> = active_platforms(snap)
        .into_iter()
        .map(|platform| platform.id.clone())
        .collect();
    let mut allowed_ids: HashSet<String> = snap.users[index]
        .platforms
        .iter()
        .cloned()
        .collect();
    for platform in active_platforms(snap) {
        if platform.owner_id.as_deref() == Some(actor.id.as_str())
            || platform.lead_ids.iter().any(|id| id == &actor.id)
        {
            allowed_ids.insert(platform.id.clone());
        }
    }
    let requested = input.platform_ids.unwrap_or_else(|| {
        snap.users[index]
            .active_platform_ids
            .iter()
            .filter(|id| allowed_ids.contains(*id))
            .cloned()
            .collect()
    });
    if requested.iter().any(|id| !active_ids.contains(id)) {
        return Err(ApiError::bad("平台不存在或已归档"));
    }
    if requested.iter().any(|id| !allowed_ids.contains(id)) {
        return Err(ApiError::forbidden("只能选择自己负责或已分配的平台"));
    }
    snap.users[index].active_role = role;
    snap.users[index].active_platform_ids = requested.into_iter().collect();
    if snap.users[index].onboarding_completed_at.is_none() {
        snap.users[index].onboarding_completed_at = Some(crate::now_iso());
    }
    if let Some(flag) = input.folder_configured {
        snap.users[index].folder_configured = flag;
    }
    Ok(snap.users[index].clone())
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInput {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub role_packs: Vec<String>,
    pub content: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub scope: String,
}

fn valid_role(role: &str) -> bool {
    matches!(
        role,
        ROLE_LEAD | ROLE_PRODUCT | ROLE_DESIGN | ROLE_DEV | ROLE_QA | ROLE_ADMIN
    )
}

pub fn create_skill(
    snap: &mut Snapshot,
    actor: &User,
    input: SkillInput,
) -> Result<Skill, ApiError> {
    let name = input.name.trim().to_string();
    if name.is_empty()
        || name.chars().count() > 80
        || !name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err(ApiError::bad(
            "技能名称只能包含字母、数字、短横线和下划线，最多 80 字符",
        ));
    }
    if snap.skills.iter().any(|skill| skill.name == name) {
        return Err(ApiError::conflict(format!("技能「{name}」已存在")));
    }
    if input.content.trim().is_empty() {
        return Err(ApiError::bad("技能内容不能为空"));
    }
    if input.content.chars().count() > 200_000 {
        return Err(ApiError::bad("技能内容不能超过 200,000 字"));
    }
    if input.description.chars().count() > 4_000 {
        return Err(ApiError::bad("技能说明不能超过 4,000 字"));
    }
    if input.summary.chars().count() > 500 {
        return Err(ApiError::bad("版本说明不能超过 500 字"));
    }
    let scope = if input.scope == "global" && actor.can_plan() {
        "global"
    } else {
        "personal"
    };
    let role_packs: Vec<String> = input
        .role_packs
        .into_iter()
        .filter(|role| valid_role(role))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let at = crate::now_iso();
    let version = SkillVersion {
        version: 1,
        content: input.content,
        summary: if input.summary.trim().is_empty() {
            "初始版本".to_string()
        } else {
            input.summary.trim().to_string()
        },
        at: at.clone(),
        by: actor.id.clone(),
        decision: if scope == "global" {
            Some("approved".to_string())
        } else {
            None
        },
        comment: String::new(),
        reviewed_by: if scope == "global" {
            Some(actor.id.clone())
        } else {
            None
        },
        reviewed_at: if scope == "global" {
            Some(at.clone())
        } else {
            None
        },
    };
    let skill = Skill {
        id: format!("skill-{}", uuid::Uuid::new_v4()),
        name: name.clone(),
        description: input.description.trim().to_string(),
        role_packs,
        scope: scope.to_string(),
        status: if scope == "global" {
            "active".to_string()
        } else {
            "pending_review".to_string()
        },
        owner_id: actor.id.clone(),
        versions: vec![version],
        created_at: at.clone(),
        updated_at: at,
    };
    snap.skills.push(skill.clone());
    if scope == "personal" {
        for planner in planner_ids(snap) {
            snap.notify(
                &planner,
                "skill_review_requested",
                None,
                &format!("技能 {name} 等待审核"),
                &format!("{} 上传了个人技能「{name}」。", actor.name),
            );
        }
    }
    snap.push_event(
        Some(&actor.id),
        "skill.created",
        None,
        None,
        json!({"name": name, "scope": scope}),
    );
    Ok(skill)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillVersionInput {
    pub content: String,
    #[serde(default)]
    pub summary: String,
}

pub fn add_skill_version(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    input: SkillVersionInput,
) -> Result<Skill, ApiError> {
    let index = snap
        .skills
        .iter()
        .position(|skill| skill.id == id)
        .ok_or_else(|| ApiError::not_found("技能不存在"))?;
    if snap.skills[index].owner_id != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden("只有技能所有者或负责人可以上传新版本"));
    }
    if snap.skills[index].status == "archived" {
        return Err(ApiError::conflict("已归档的技能不能上传新版本，请先恢复"));
    }
    if input.content.trim().is_empty() {
        return Err(ApiError::bad("技能内容不能为空"));
    }
    if input.content.chars().count() > 200_000 {
        return Err(ApiError::bad("技能内容不能超过 200,000 字"));
    }
    if input.summary.chars().count() > 500 {
        return Err(ApiError::bad("版本说明不能超过 500 字"));
    }
    // 新版本一律进入审核，避免上传者自己把未审核内容上线。
    let approved = false;
    let version = snap.skills[index].versions.len() as u32 + 1;
    let at = crate::now_iso();
    snap.skills[index].versions.push(SkillVersion {
        version,
        content: input.content,
        summary: if input.summary.trim().is_empty() {
            format!("v{version}")
        } else {
            input.summary.trim().to_string()
        },
        at: at.clone(),
        by: actor.id.clone(),
        decision: if approved {
            Some("approved".to_string())
        } else {
            None
        },
        comment: String::new(),
        reviewed_by: if approved {
            Some(actor.id.clone())
        } else {
            None
        },
        reviewed_at: if approved { Some(at.clone()) } else { None },
    });
    snap.skills[index].status = if approved {
        "active".to_string()
    } else {
        "pending_review".to_string()
    };
    snap.skills[index].updated_at = at;
    let skill = snap.skills[index].clone();
    if !approved {
        for planner in planner_ids(snap) {
            snap.notify(
                &planner,
                "skill_review_requested",
                None,
                &format!("技能 {} v{version} 等待审核", skill.name),
                &format!("{} 上传了新版本。", actor.name),
            );
        }
    }
    snap.push_event(
        Some(&actor.id),
        "skill.version_created",
        None,
        None,
        json!({"name": skill.name, "version": version}),
    );
    Ok(skill)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateInput {
    pub description: Option<String>,
    pub role_packs: Option<Vec<String>>,
    pub status: Option<String>,
}

pub fn update_skill(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    input: SkillUpdateInput,
) -> Result<Skill, ApiError> {
    let index = snap
        .skills
        .iter()
        .position(|skill| skill.id == id)
        .ok_or_else(|| ApiError::not_found("技能不存在"))?;
    if snap.skills[index].owner_id != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden("只有技能所有者或负责人可以修改技能"));
    }
    if let Some(description) = input.description {
        let description = description.trim();
        if description.chars().count() > 4000 {
            return Err(ApiError::bad("技能说明不能超过 4000 字"));
        }
        snap.skills[index].description = description.to_string();
    }
    if let Some(role_packs) = input.role_packs {
        snap.skills[index].role_packs = role_packs
            .into_iter()
            .filter(|role| valid_role(role))
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
    }
    if let Some(status) = input.status {
        if !["active", "archived", "pending_review"].contains(&status.as_str()) {
            return Err(ApiError::bad("技能状态不合法"));
        }
        if status == "active" {
            let approved = snap.skills[index]
                .versions
                .last()
                .map(|version| version.decision.as_deref() == Some("approved"))
                .unwrap_or(false);
            if !approved {
                return Err(ApiError::conflict("技能最新版本还没有通过审核，不能启用"));
            }
        }
        snap.skills[index].status = status;
    }
    snap.skills[index].updated_at = crate::now_iso();
    Ok(snap.skills[index].clone())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillReviewInput {
    pub decision: String,
    #[serde(default)]
    pub comment: String,
}

pub fn review_skill(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    input: SkillReviewInput,
) -> Result<Skill, ApiError> {
    require_plan(actor, "审核技能的")?;
    let index = snap
        .skills
        .iter()
        .position(|skill| skill.id == id)
        .ok_or_else(|| ApiError::not_found("技能不存在"))?;
    if snap.skills[index].owner_id == actor.id && !actor.has_role(ROLE_ADMIN) {
        return Err(ApiError::forbidden("不能审核自己创建的技能"));
    }
    let approved = match input.decision.as_str() {
        "approve" | "approved" | "通过" => true,
        "reject" | "rejected" | "退回" => false,
        _ => return Err(ApiError::bad("decision 只能是 approve 或 reject")),
    };
    let at = crate::now_iso();
    let version = {
        let latest = snap.skills[index]
            .versions
            .last_mut()
            .ok_or_else(|| ApiError::conflict("技能还没有版本"))?;
        if latest.decision.is_some() {
            return Err(ApiError::conflict("当前版本已经审核过"));
        }
        latest.decision = Some(if approved { "approved" } else { "rejected" }.to_string());
        latest.comment = input.comment.trim().to_string();
        latest.reviewed_by = Some(actor.id.clone());
        latest.reviewed_at = Some(at.clone());
        latest.version
    };
    snap.skills[index].status = if approved {
        "active".to_string()
    } else {
        "changes_requested".to_string()
    };
    snap.skills[index].updated_at = at.clone();
    let skill = snap.skills[index].clone();
    snap.notify(
        &skill.owner_id,
        "skill_reviewed",
        None,
        &format!(
            "技能 {} v{version} {}",
            skill.name,
            if approved { "已通过" } else { "被退回" }
        ),
        &input.comment,
    );
    snap.push_event(
        Some(&actor.id),
        "skill.reviewed",
        None,
        None,
        json!({"name": skill.name, "version": version, "approved": approved}),
    );
    Ok(skill)
}

// ---------------------------------------------------------------------------
// 需求活文档与附件/设计稿
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInput {
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub acceptance_criteria: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub expected_version: Option<u32>,
}

fn bounded_text(value: &str, label: &str, max: usize) -> Result<String, ApiError> {
    if value.len() > max {
        return Err(ApiError::bad(format!("{label}过长（最多 {max} 字符）")));
    }
    Ok(value.trim().to_string())
}

pub fn update_requirement_document(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: DocumentInput,
) -> Result<Requirement, ApiError> {
    if !actor.can_product() && !actor.can_plan() {
        return Err(ApiError::forbidden(format!(
            "{} 没有编辑需求文档的权限（需要产品/负责人/管理员身份）",
            actor.name
        )));
    }
    let index = req_index(snap, reference)?;
    check_not_creating(&snap.requirements[index], "编辑需求文档")?;
    if input.summary.is_none() && input.acceptance_criteria.is_none() && input.body.is_none() {
        return Err(ApiError::bad("没有需要保存的文档内容"));
    }
    if let Some(expected) = input.expected_version {
        if expected != snap.requirements[index].document.version {
            return Err(ApiError::conflict("需求文档已被其他人更新，请刷新后再保存"));
        }
    }
    if let Some(summary) = input.summary {
        snap.requirements[index].document.summary = bounded_text(&summary, "需求摘要", 4_000)?;
    }
    if let Some(criteria) = input.acceptance_criteria {
        snap.requirements[index].document.acceptance_criteria =
            bounded_text(&criteria, "验收标准", 40_000)?;
    }
    if let Some(body) = input.body {
        snap.requirements[index].document.body = bounded_text(&body, "需求正文", 200_000)?;
    }
    let at = crate::now_iso();
    snap.requirements[index].document.version += 1;
    snap.requirements[index].document.updated_at = Some(at.clone());
    snap.requirements[index].document.updated_by = Some(actor.id.clone());
    snap.requirements[index].updated_at = at;
    let requirement = snap.requirements[index].clone();
    let mut audience: Vec<String> = dev_assignee_ids(&requirement);
    if let Some(designer) = &requirement.designer_id {
        audience.push(designer.clone());
    }
    if requirement.owner_id != actor.id {
        audience.push(requirement.owner_id.clone());
    }
    audience.sort();
    audience.dedup();
    for user_id in audience {
        if user_id == actor.id {
            continue;
        }
        snap.notify(
            &user_id,
            "requirement.document_updated",
            Some(&requirement.id),
            &format!("{} 需求文档已更新", requirement.code),
            &format!(
                "{} 更新了需求文档（文档 v{}），请查看最新摘要与验收标准。",
                actor.name, requirement.document.version
            ),
        );
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.document_updated",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"documentVersion": requirement.document.version}),
    );
    Ok(requirement)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactInput {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub content_type: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub encoding: String,
    #[serde(default)]
    pub design_version: Option<String>,
}

fn clean_artifact_name(raw: &str) -> Result<String, ApiError> {
    let name = raw.trim().replace('\\', "/");
    if name.is_empty() {
        return Err(ApiError::bad("附件名称不能为空"));
    }
    if name.len() > 240 {
        return Err(ApiError::bad("附件名称过长（最多 240 字符）"));
    }
    if name.starts_with('/') || name.split('/').any(|part| part == "..") {
        return Err(ApiError::bad("附件名称不能包含路径穿越"));
    }
    if name.chars().any(|ch| ch.is_control()) {
        return Err(ApiError::bad("附件名称不能包含控制字符"));
    }
    Ok(name)
}

fn clean_content_type(raw: &str) -> String {
    let value = raw.trim().to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 100
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || "/+-.;=_".contains(ch))
    {
        return "text/plain".to_string();
    }
    // 只允许被动内容类型；HTML/SVG/JS 等主动内容一律降级，避免同源 Blob 预览执行脚本。
    match value.split(';').next().unwrap_or("").trim() {
        "text/plain" | "text/markdown" | "application/json" | "image/png" | "image/jpeg"
        | "image/gif" | "image/webp" | "application/pdf" => value,
        _ => "application/octet-stream".to_string(),
    }
}

fn decoded_base64_len(content: &str) -> Result<usize, ApiError> {
    let compact: String = content.chars().filter(|ch| !ch.is_ascii_whitespace()).collect();
    if compact.is_empty() || compact.len() % 4 != 0 {
        return Err(ApiError::bad("base64 内容不合法（长度必须是 4 的倍数）"));
    }
    if !compact
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '/' || ch == '=')
    {
        return Err(ApiError::bad("base64 内容包含非法字符"));
    }
    let padding = compact.chars().rev().take_while(|ch| *ch == '=').count();
    if padding > 2 {
        return Err(ApiError::bad("base64 内容补位不合法"));
    }
    let unpadded = &compact[..compact.len() - padding];
    if unpadded.contains('=') {
        return Err(ApiError::bad("base64 补位只能出现在末尾"));
    }
    Ok(compact.len() / 4 * 3 - padding)
}

pub fn add_artifact(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: ArtifactInput,
) -> Result<ArtifactMeta, ApiError> {
    let index = req_index(snap, reference)?;
    check_not_creating(&snap.requirements[index], "上传附件")?;
    let kind = match input.kind.trim() {
        "design" => "design",
        "test-report" => "test-report",
        _ => "attachment",
    };
    if kind == "design" {
        if !actor.can_design() {
            return Err(ApiError::forbidden(format!(
                "{} 没有上传设计稿的权限（需要设计/负责人/管理员身份）",
                actor.name
            )));
        }
        if snap.requirements[index].design_status == DESIGN_NONE {
            return Err(ApiError::conflict("该需求标记为无需设计"));
        }
    }
    let content = input.content;
    if content.is_empty() {
        return Err(ApiError::bad("附件内容为空"));
    }
    let encoding = match input.encoding.trim() {
        "" => "",
        "base64" => "base64",
        other => return Err(ApiError::bad(format!("不支持的附件编码：{other}"))),
    };
    let decoded_size = if encoding == "base64" {
        let size = decoded_base64_len(&content)?;
        if size > 3_000_000 {
            return Err(ApiError::bad("附件过大（解码后最多 3 MB）"));
        }
        size
    } else {
        if content.len() > 4_000_000 {
            return Err(ApiError::bad("附件过大（最多 4 MB 文本）"));
        }
        content.len()
    };
    let meta = ArtifactMeta {
        id: format!("art-{}", uuid::Uuid::new_v4()),
        requirement_id: snap.requirements[index].id.clone(),
        name: clean_artifact_name(&input.name)?,
        kind: kind.to_string(),
        content_type: clean_content_type(&input.content_type),
        encoding: encoding.to_string(),
        size: decoded_size,
        created_at: crate::now_iso(),
        created_by: actor.id.clone(),
        design_version: if kind == "design" {
            let count = snap.requirements[index].design_versions.len();
            if let Some(version) = input.design_version.as_deref() {
                let valid = version
                    .strip_prefix('d')
                    .and_then(|value| value.parse::<u32>().ok())
                    .map(|value| value >= 1 && value as usize <= count)
                    .unwrap_or(false);
                if !valid {
                    return Err(ApiError::bad("设计版本不存在"));
                }
                Some(version.to_string())
            } else {
                (count > 0).then(|| format!("d{count}"))
            }
        } else {
            None
        },
    };
    snap.requirements[index].artifacts.push(meta.clone());
    snap.requirements[index].updated_at = meta.created_at.clone();
    snap.artifact_contents.push(ArtifactContent {
        id: meta.id.clone(),
        content,
    });
    let requirement_id = snap.requirements[index].id.clone();
    let iteration_id = snap.requirements[index].iteration_id.clone();
    let owner_id = snap.requirements[index].owner_id.clone();
    let code = snap.requirements[index].code.clone();
    snap.push_event(
        Some(&actor.id),
        "requirement.artifact_added",
        Some(&requirement_id),
        Some(&iteration_id),
        json!({"artifactId": meta.id, "name": meta.name, "kind": meta.kind, "size": meta.size}),
    );
    if kind == "design" && owner_id != actor.id {
        snap.notify(
            &owner_id,
            "design_artifact",
            Some(&requirement_id),
            &format!("{code} 收到新的设计稿"),
            &format!("设计稿 {} 已上传到团队服务端。", meta.name),
        );
    }
    Ok(meta)
}

pub fn get_artifact(snap: &Snapshot, id: &str) -> Result<(ArtifactMeta, String), ApiError> {
    let meta = snap
        .requirements
        .iter()
        .flat_map(|requirement| requirement.artifacts.iter())
        .find(|artifact| artifact.id == id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("附件不存在"))?;
    let content = snap
        .artifact_contents
        .iter()
        .find(|item| item.id == id)
        .map(|item| item.content.clone())
        .ok_or_else(|| ApiError::not_found("附件内容不存在"))?;
    Ok((meta, content))
}
