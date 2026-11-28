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
        STATUS_CANCELLED => "已取消",
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

fn validate_short_text(value: &str, label: &str, max_chars: usize) -> Result<String, ApiError> {
    let text = value.trim().to_string();
    if text.chars().count() > max_chars {
        return Err(ApiError::bad(format!("{label}长度不能超过 {max_chars}")));
    }
    if text.chars().any(char::is_control) {
        return Err(ApiError::bad(format!("{label}不能包含控制字符")));
    }
    Ok(text)
}

fn validate_long_text(value: &str, label: &str, max_chars: usize) -> Result<String, ApiError> {
    let text = value.trim().to_string();
    if text.chars().count() > max_chars {
        return Err(ApiError::bad(format!("{label}长度不能超过 {max_chars}")));
    }
    if text
        .chars()
        .any(|ch| ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t')
    {
        return Err(ApiError::bad(format!("{label}不能包含控制字符")));
    }
    Ok(text)
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
    // 没有任何偏好时取每个活跃平台组里排第一的平台（组按顺序，最多两个），
    // 不写死演示环境的平台 id，也不依赖平台在库里的存储顺序。
    let mut best: Vec<(&PlatformGroup, &Platform)> = Vec::new();
    for platform in active {
        let Some(group) = snap
            .groups
            .iter()
            .find(|group| group.id == platform.group_id)
        else {
            continue;
        };
        match best.iter_mut().find(|(known, _)| known.id == group.id) {
            Some((_, current)) if current.order <= platform.order => {}
            Some((_, current)) => *current = platform,
            None => best.push((group, platform)),
        }
    }
    best.sort_by_key(|(group, _)| group.order);
    best.into_iter()
        .take(2)
        .map(|(_, platform)| platform.id.clone())
        .collect()
}

// 通知里展示平台时用中文简称（如「交易服务端」），不要把内部 id（trade-server）塞给用户。
fn platform_display_name(snap: &Snapshot, platform_id: &str) -> String {
    snap.platforms
        .iter()
        .find(|platform| platform.id == platform_id)
        .map(|platform| platform.short_name.clone())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| platform_id.to_string())
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
        .next_back()
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
    items.iter().map(value).max().unwrap_or(0) + 1
}

fn make_entity_id<'a>(existing: impl Iterator<Item = &'a str>, prefix: &str, name: &str) -> String {
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

fn req_index(snap: &Snapshot, reference: &str, actor: &User) -> Result<usize, ApiError> {
    let index = snap
        .requirement_index(reference)
        .ok_or_else(|| ApiError::not_found(format!("找不到需求「{reference}」")))?;
    // 未提交的草稿只有创建人和负责人能操作：其他角色连“存在”都不该知道，
    // 所以对不可见的草稿统一返回 404，和列表、需求页的可见性保持一致。
    // 负责人要能接管创建失败、补文档，所以这里比列表可见性多放行 can_plan。
    let requirement = &snap.requirements[index];
    if requirement_visible_to(requirement, actor) || actor.can_plan() {
        Ok(index)
    } else {
        Err(ApiError::not_found(format!("找不到需求「{reference}」")))
    }
}

fn planner_ids(snap: &Snapshot) -> Vec<String> {
    snap.users
        .iter()
        .filter(|user| user.active && user.can_plan())
        .map(|user| user.id.clone())
        .collect()
}

// 测试说明可以留空；通知正文不能以句号开头。
fn test_note_text(note: &str) -> &str {
    if note.is_empty() {
        "测试不通过，请查看测试记录"
    } else {
        note
    }
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

fn ensure_status(
    requirement: &Requirement,
    allowed: &[&str],
    action: &str,
) -> Result<(), ApiError> {
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
        return Err(ApiError::conflict(format!(
            "需求还在创建中，稍后再{action}"
        )));
    }
    if requirement.status == STATUS_CREATE_FAILED {
        return Err(ApiError::conflict(format!(
            "需求文件夹/会话创建失败，先重试创建再{action}"
        )));
    }
    // 冻结/发布是终态：文档、附件、设计交付和评审都不能再把需求改回进行中。
    if matches!(
        requirement.status.as_str(),
        STATUS_FROZEN | STATUS_RELEASED | STATUS_DONE | STATUS_CANCELLED
    ) {
        return Err(ApiError::conflict(format!(
            "需求当前是「{}」，不能{action}",
            status_label(&requirement.status)
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub name: Option<String>,
    pub description: Option<String>,
}

pub fn create_project(
    snap: &mut Snapshot,
    actor: &User,
    input: ProjectInput,
) -> Result<Project, ApiError> {
    require_plan(actor, "创建项目的")?;
    let name = validate_short_text(input.name.as_deref().unwrap_or_default(), "项目名称", 40)?;
    if name.is_empty() {
        return Err(ApiError::bad("项目名称不能为空"));
    }
    let description = validate_long_text(
        input.description.as_deref().unwrap_or_default(),
        "项目简介",
        500,
    )?;
    if snap
        .projects
        .iter()
        .any(|project| !project.archived && project.name.eq_ignore_ascii_case(&name))
    {
        return Err(ApiError::conflict(format!("项目「{name}」已存在")));
    }
    let project = Project {
        id: format!("project-{}", uuid::Uuid::new_v4()),
        name,
        description,
        owner_id: Some(actor.id.clone()),
        archived: false,
        created_at: crate::now_iso(),
    };
    snap.projects.push(project.clone());
    if let Some(user) = snap.users.iter_mut().find(|user| user.id == actor.id) {
        user.current_project_id = Some(project.id.clone());
        user.current_iteration_id = None;
    }
    snap.push_event(
        Some(&actor.id),
        "project.created",
        None,
        Some(&project.id),
        json!({"name": project.name}),
    );
    Ok(project)
}

pub fn update_project(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    input: ProjectInput,
) -> Result<Project, ApiError> {
    require_plan(actor, "编辑项目的")?;
    let index = snap
        .projects
        .iter()
        .position(|project| project.id == id)
        .ok_or_else(|| ApiError::not_found("项目不存在"))?;
    if let Some(raw_name) = input.name {
        let name = validate_short_text(&raw_name, "项目名称", 40)?;
        if name.is_empty() {
            return Err(ApiError::bad("项目名称不能为空"));
        }
        if snap.projects.iter().any(|project| {
            project.id != id && !project.archived && project.name.eq_ignore_ascii_case(&name)
        }) {
            return Err(ApiError::conflict(format!("项目「{name}」已存在")));
        }
        snap.projects[index].name = name;
    }
    if let Some(description) = input.description {
        snap.projects[index].description = validate_long_text(&description, "项目简介", 500)?;
    }
    let project = snap.projects[index].clone();
    snap.push_event(
        Some(&actor.id),
        "project.updated",
        None,
        Some(&project.id),
        json!({"name": project.name}),
    );
    Ok(project)
}

/// 切换当前项目：顺手把不属于该项目的当前迭代清掉，避免“项目 A 下选中项目 B 的迭代”。
pub fn select_project(snap: &mut Snapshot, actor: &User, id: &str) -> Result<Project, ApiError> {
    let project = snap
        .projects
        .iter()
        .find(|project| project.id == id && !project.archived)
        .cloned()
        .ok_or_else(|| ApiError::not_found("项目不存在或已归档"))?;
    // 以快照里的当前用户为准：令牌里的 current_iteration_id 是登录时的旧值。
    let current_iteration_id = snap
        .users
        .iter()
        .find(|user| user.id == actor.id)
        .and_then(|user| user.current_iteration_id.clone());
    let keep_iteration = current_iteration_id
        .as_deref()
        .and_then(|id| snap.iterations.iter().find(|iteration| iteration.id == id))
        .map(|iteration| iteration.project_id.as_deref() == Some(project.id.as_str()))
        .unwrap_or(false);
    if let Some(user) = snap.users.iter_mut().find(|user| user.id == actor.id) {
        user.current_project_id = Some(project.id.clone());
        if !keep_iteration {
            user.current_iteration_id = None;
        }
    }
    Ok(project)
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
    #[serde(default)]
    pub project_id: Option<String>,
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
    // 迭代挂在项目下：默认落在当前项目，也允许显式指定（用于把迭代建到别的项目里）。
    let project = match input.project_id.as_deref() {
        Some(id) if !id.trim().is_empty() => snap
            .project(id)
            .filter(|project| !project.archived)
            .cloned()
            .ok_or_else(|| ApiError::not_found("项目不存在或已归档"))?,
        _ => snap
            .active_project(actor)
            .cloned()
            .ok_or_else(|| ApiError::conflict("还没有项目，请先创建项目"))?,
    };
    let name = match input.name {
        Some(raw) => {
            let trimmed = validate_short_text(&raw, "迭代名称", 80)?;
            if trimmed.is_empty() {
                code.clone()
            } else {
                trimmed
            }
        }
        None => code.clone(),
    };
    let phase = match input.phase {
        Some(raw) => {
            let trimmed = validate_short_text(&raw, "迭代阶段", 80)?;
            if trimmed.is_empty() {
                "需求 / 设计 / 开发 / 测试".to_string()
            } else {
                trimmed
            }
        }
        None => "需求 / 设计 / 开发 / 测试".to_string(),
    };
    let iteration = Iteration {
        id: format!("iteration-{}", uuid::Uuid::new_v4()),
        project_id: Some(project.id.clone()),
        code: code.clone(),
        short_code: unique_short_code(snap, &code),
        name,
        phase,
        status: "planning".to_string(),
        start_date,
        end_date,
        owner_id: Some(actor.id.clone()),
        reviewer_ids,
        archived: false,
        closed_at: None,
        created_at: crate::now_iso(),
    };
    snap.iterations.push(iteration.clone());
    if let Some(user) = snap.users.iter_mut().find(|user| user.id == actor.id) {
        user.current_iteration_id = Some(iteration.id.clone());
        user.current_project_id = Some(project.id.clone());
    }
    snap.push_event(
        Some(&actor.id),
        "iteration.created",
        None,
        Some(&iteration.id),
        json!({"code": iteration.code, "name": iteration.name, "projectId": project.id}),
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
        let name = validate_short_text(&name, "迭代名称", 80)?;
        if !name.is_empty() {
            snap.iterations[index].name = name;
        }
    }
    if let Some(phase) = input.phase {
        let phase = validate_short_text(&phase, "迭代阶段", 80)?;
        if !phase.is_empty() {
            snap.iterations[index].phase = phase;
        }
    }
    if let Some(status) = input.status {
        if !["planning", "in_progress", "done"].contains(&status.as_str()) {
            return Err(ApiError::bad(
                "迭代状态只能是 planning / in_progress / done",
            ));
        }
        if status == "done" {
            if snap.iterations[index].closed_at.is_none() {
                snap.iterations[index].closed_at = Some(crate::now_iso());
            }
        } else {
            snap.iterations[index].closed_at = None;
        }
        snap.iterations[index].status = status;
    }
    if input.start_date.is_some() {
        snap.iterations[index].start_date = validate_date(input.start_date.as_deref(), "开始日期")?;
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
        if iteration.project_id.is_some() {
            user.current_project_id = iteration.project_id.clone();
        }
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
    if archived {
        let busy = snap.requirements.iter().any(|requirement| {
            requirement.iteration_id == id
                && matches!(
                    requirement.status.as_str(),
                    STATUS_CREATING
                        | STATUS_CREATE_FAILED
                        | STATUS_PENDING_REVIEW
                        | STATUS_SCHEDULED
                        | STATUS_IN_PROGRESS
                        | STATUS_DEV_DONE
                        | STATUS_TESTING
                        | STATUS_TEST_FAILED
                        | STATUS_TEST_PASSED
                )
        });
        if busy {
            return Err(ApiError::conflict(
                "迭代里还有待评审/已排期/开发中/测试中或创建中的需求，先移出或处理完再归档",
            ));
        }
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
    let index = req_index(snap, reference, actor)?;
    // 不能只看当前 status：/req-scope out 会把开发中/测试中的需求改回 backlog，
    // 再看 status 就会被当成“未开始”而允许移动。历史痕迹才是准确边界。
    let started = snap.requirements[index]
        .dev_tasks
        .iter()
        .any(|task| task.started_at.is_some() || task.finished_at.is_some())
        || !snap.requirements[index].test_runs.is_empty();
    if started
        || !matches!(
            snap.requirements[index].status.as_str(),
            STATUS_BACKLOG
                | STATUS_DRAFT
                | STATUS_PENDING_REVIEW
                | STATUS_CHANGES_REQUESTED
                | STATUS_APPROVED
                | STATUS_SCHEDULED
        )
    {
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
    // 评审中途换迭代不能把已经投过票的会签人换掉，否则本轮票数作废。
    let current_reviewers = snap.requirements[index].reviewer_ids.clone();
    let target_reviewers = if !current_reviewers.is_empty() {
        current_reviewers
    } else if target.reviewer_ids.is_empty() {
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

/// 未提交 v1 的需求是产品自己的草稿：创建中、创建失败、草稿都还没发布，
/// 只有创建人能看到；提交进入评审后，其他角色才在列表和需求页里看到它。
pub fn requirement_visible_to(requirement: &Requirement, actor: &User) -> bool {
    requirement.owner_id == actor.id
        || !matches!(
            requirement.status.as_str(),
            STATUS_CREATING | STATUS_CREATE_FAILED | STATUS_DRAFT
        )
}

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
        tester_id: None,
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
        prototype_versions: Vec::new(),
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

pub fn delete_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference, actor)?;
    if snap.requirements[index].owner_id != actor.id {
        return Err(ApiError::forbidden("只有需求的创建人可以删除这条需求"));
    }
    let requirement = snap.requirements[index].clone();
    // 评审通过后其他角色已经在上面投入了设计、开发和测试，删除会抹掉他们的工作；
    // 这种需求只能移出本期范围（backlog），历史要留着。
    let has_downstream_work = requirement.designer_id.is_some()
        || requirement.tester_id.is_some()
        || !requirement.design_versions.is_empty()
        || !requirement.reviews.is_empty()
        || requirement
            .dev_tasks
            .iter()
            .any(|task| task.assignee_id.is_some());
    if !matches!(
        requirement.status.as_str(),
        STATUS_CREATING
            | STATUS_CREATE_FAILED
            | STATUS_DRAFT
            | STATUS_PENDING_REVIEW
            | STATUS_CHANGES_REQUESTED
    ) || has_downstream_work
    {
        return Err(ApiError::conflict(
            "需求已进入评审或已有设计、开发、测试记录，不能删除；如不再要做，请把它移出本期范围",
        ));
    }
    // 附件正文和通知不在需求行里，删需求时一起清掉；会话记录随需求行一起消失。
    let artifact_ids: HashSet<String> = requirement
        .artifacts
        .iter()
        .map(|artifact| artifact.id.clone())
        .collect();
    snap.artifact_contents
        .retain(|content| !artifact_ids.contains(&content.id));
    snap.notifications.retain(|notification| {
        notification.requirement_id.as_deref() != Some(requirement.id.as_str())
    });
    snap.pending_notifications.retain(|notification| {
        notification.requirement_id.as_deref() != Some(requirement.id.as_str())
    });
    snap.requirements.remove(index);
    snap.push_event(
        Some(&actor.id),
        "requirement.deleted",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"code": requirement.code, "title": requirement.title}),
    );
    Ok(requirement)
}

pub fn bind_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    session_record_id: Option<&str>,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference, actor)?;
    let owner = snap.requirements[index].owner_id.clone();
    if owner != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden(format!(
            "{} 没有绑定这个需求的权限",
            actor.name
        )));
    }
    let status = snap.requirements[index].status.as_str();
    if !matches!(
        status,
        STATUS_CREATING | STATUS_CREATE_FAILED | STATUS_DRAFT
    ) {
        return Err(ApiError::conflict(
            "只有创建中、创建失败或草稿状态的需求可以绑定会话",
        ));
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
    let index = req_index(snap, reference, actor)?;
    let owner = snap.requirements[index].owner_id.clone();
    if owner != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden(format!(
            "{} 没有更新这个需求的权限",
            actor.name
        )));
    }
    let status = snap.requirements[index].status.as_str();
    if !matches!(status, STATUS_CREATING | STATUS_CREATE_FAILED) {
        return Err(ApiError::conflict(
            "只有创建中或创建失败的需求可以记录创建失败",
        ));
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
    let index = req_index(snap, reference, actor)?;
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
    let label = validate_short_text(label, "会话标题", 80)?;
    let record = SessionRecord {
        id: format!("session-{}", uuid::Uuid::new_v4()),
        kind: kind.to_string(),
        label: if label.is_empty() {
            session_type_label(kind).to_string()
        } else {
            label
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
    let index = req_index(snap, reference, actor)?;
    let position = snap.requirements[index]
        .sessions
        .iter()
        .position(|session| session.id == record_id)
        .ok_or_else(|| ApiError::not_found("会话记录不存在"))?;
    let created_by = snap.requirements[index].sessions[position]
        .created_by
        .clone();
    if created_by.as_deref() != Some(actor.id.as_str()) && !actor.can_plan() {
        return Err(ApiError::forbidden(
            "只有会话创建人或负责人可以归档/恢复会话",
        ));
    }
    snap.requirements[index].sessions[position].archived = archived;
    if archived && snap.requirements[index].primary_session_id.as_deref() == Some(record_id) {
        snap.requirements[index].primary_session_id = snap.requirements[index]
            .sessions
            .iter()
            .find(|session| !session.archived && session.kind == "requirement")
            .or_else(|| {
                snap.requirements[index]
                    .sessions
                    .iter()
                    .find(|session| !session.archived)
            })
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

/// 提交时顺带定下的分工。都可省略：不指定就留待认领，不替用户做决定。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitAssignments {
    #[serde(default)]
    pub designer_id: Option<String>,
    #[serde(default)]
    pub tester_id: Option<String>,
    #[serde(default)]
    pub dev: Vec<SubmitDevAssignment>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitDevAssignment {
    pub platform_id: String,
    pub assignee_id: String,
}

/// 提交时顺带确认需求范围：涉及端和是否需要设计。两者都可省略，省略表示不改。
fn apply_submit_scope(
    requirement: &mut Requirement,
    platforms: &[Platform],
    platform_ids: Option<Vec<String>>,
    design_not_needed: Option<bool>,
) -> Result<(), ApiError> {
    if let Some(raw_ids) = platform_ids {
        let mut ids: Vec<String> = Vec::new();
        for id in raw_ids {
            let id = id.trim();
            if !id.is_empty() && !ids.iter().any(|known| known == id) {
                ids.push(id.to_string());
            }
        }
        if ids.is_empty() {
            return Err(ApiError::bad("至少保留一个涉及端"));
        }
        for id in &ids {
            if !platforms
                .iter()
                .any(|platform| platform.active && &platform.id == id)
            {
                return Err(ApiError::bad(format!("平台不存在或已归档：{id}")));
            }
        }
        if ids != requirement.platform_ids {
            // 已经有开发分工时改端会悄悄丢掉别人的任务，直接拒绝；先把任务收回来再改。
            if requirement
                .dev_tasks
                .iter()
                .any(|task| task.assignee_id.is_some() || task.started_at.is_some())
            {
                return Err(ApiError::conflict("已经有开发任务，不能再改涉及端"));
            }
            requirement
                .dev_tasks
                .retain(|task| ids.iter().any(|id| id == &task.platform_id));
            requirement.platform_ids = ids;
        }
    }
    if let Some(not_needed) = design_not_needed {
        if not_needed {
            if requirement.designer_id.is_some()
                || requirement.design_status != DESIGN_UNCLAIMED
                || requirement
                    .artifacts
                    .iter()
                    .any(|artifact| artifact.kind == "design")
                || !requirement.design_versions.is_empty()
            {
                return Err(ApiError::conflict("设计已认领或已交付，不能标记为无需设计"));
            }
            requirement.design_status = DESIGN_NONE.to_string();
        } else if requirement.design_status == DESIGN_NONE {
            requirement.design_status = DESIGN_UNCLAIMED.to_string();
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn submit_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    summary: Option<&str>,
    prototype_files: Vec<PrototypeVersionFile>,
    platform_ids: Option<Vec<String>>,
    design_not_needed: Option<bool>,
    assignments: SubmitAssignments,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference, actor)?;
    check_not_creating(&snap.requirements[index], "提交")?;
    if !actor.can_product() {
        return Err(ApiError::forbidden(format!(
            "{} 没有提交需求的权限（需要产品/负责人/管理员身份）",
            actor.name
        )));
    }
    if snap.requirements[index].owner_id != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden(
            "只有需求负责人或负责人/管理员可以提交这个需求",
        ));
    }
    // 待评审中也能再提交：相当于在这版需求上做变更，直接生成下一个版本
    // （v2、v3…），评审按最新一版重新开始，上一版的会签记录保留但不再计数。
    if !matches!(
        snap.requirements[index].status.as_str(),
        STATUS_DRAFT | STATUS_CHANGES_REQUESTED | STATUS_BACKLOG | STATUS_PENDING_REVIEW
    ) {
        return Err(ApiError::conflict(
            "当前状态不能提交：草稿、待修改、已暂缓或待评审中的需求可以提交（待评审中再提交会生成新版本）",
        ));
    }
    apply_submit_scope(
        &mut snap.requirements[index],
        &snap.platforms,
        platform_ids,
        design_not_needed,
    )?;
    let version = snap.requirements[index].versions.len() as u32 + 1;
    // 原型版本只能引用这条需求自己的原型附件：附件 ID 是客户端传的，不能
    // 直接信；顺手挡住重名，免得版本里出现两屏同名文件。
    let mut prototype: Vec<PrototypeVersionFile> = Vec::new();
    for file in prototype_files {
        let name = file.name.trim().to_string();
        if name.is_empty() {
            return Err(ApiError::bad("原型文件名不能为空"));
        }
        let known = snap.requirements[index]
            .artifacts
            .iter()
            .any(|artifact| artifact.id == file.artifact_id && artifact.kind == "prototype");
        if !known {
            return Err(ApiError::bad(format!(
                "原型「{name}」不在这条需求的原型附件里"
            )));
        }
        if prototype.iter().any(|item| item.name == name) {
            return Err(ApiError::bad(format!("原型文件名重复：{name}")));
        }
        prototype.push(PrototypeVersionFile {
            name,
            artifact_id: file.artifact_id,
        });
    }
    let text = summary
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(String::from)
        .unwrap_or_else(|| format!("v{version} 提交"));
    // 会签人不能为空：否则任何负责人一次 approve 就能把需求变成已通过。
    // 需求没配会签人时继承迭代配置，再退回到全体负责人。
    let fallback_reviewers = {
        let iteration = snap
            .iterations
            .iter()
            .find(|item| item.id == snap.requirements[index].iteration_id)
            .map(|item| item.reviewer_ids.clone())
            .unwrap_or_default();
        if iteration.is_empty() {
            planner_ids(snap)
        } else {
            iteration
        }
    };
    if snap.requirements[index].reviewer_ids.is_empty() {
        snap.requirements[index].reviewer_ids = fallback_reviewers;
    }
    if snap.requirements[index].reviewer_ids.is_empty() {
        return Err(ApiError::bad("迭代还没有配置会签人，请先在迭代设置里指定"));
    }
    let document_snapshot = snap.requirements[index].document.clone();
    snap.requirements[index].versions.push(Version {
        version,
        summary: text,
        at: crate::now_iso(),
        by: actor.id.clone(),
        document: Some(document_snapshot),
    });
    if !prototype.is_empty() {
        snap.requirements[index]
            .prototype_versions
            .push(PrototypeVersion {
                version,
                files: prototype,
                created_at: crate::now_iso(),
                created_by: actor.id.clone(),
            });
    }
    snap.requirements[index].status = STATUS_PENDING_REVIEW.to_string();
    snap.requirements[index].in_scope = false;
    snap.requirements[index].updated_at = crate::now_iso();
    // 提交时定分工：只落用户明确选的人；没选的角色保持待认领。
    let mut assigned_notices: Vec<(String, &'static str, String, String)> = Vec::new();
    if let Some(raw) = assignments.designer_id.as_deref() {
        let id = raw.trim();
        if !id.is_empty() {
            let uid = {
                let user = snap
                    .active_user(id)
                    .ok_or_else(|| ApiError::bad("设计负责人不存在或已停用"))?;
                if !user.can_design() {
                    return Err(ApiError::bad(format!(
                        "{} 没有设计身份，不能指派为设计负责人",
                        user.name
                    )));
                }
                user.id.clone()
            };
            if snap.requirements[index].design_status == DESIGN_NONE {
                return Err(ApiError::conflict("这条需求标记为无需设计"));
            }
            snap.requirements[index].designer_id = Some(uid.clone());
            snap.requirements[index].design_status = DESIGN_DESIGNING.to_string();
            assigned_notices.push((
                uid,
                "design_assigned",
                format!("{} 指派了设计", snap.requirements[index].code),
                format!(
                    "{}「{}」的设计由你负责。",
                    snap.requirements[index].code, snap.requirements[index].title
                ),
            ));
        }
    }
    let mut seen_platforms: Vec<String> = Vec::new();
    for item in &assignments.dev {
        let platform_id = item.platform_id.trim().to_string();
        if platform_id.is_empty() || seen_platforms.iter().any(|id| id == &platform_id) {
            continue;
        }
        check_platform(&snap.requirements[index], &platform_id)?;
        let (uid, uname, wrong_platform) = {
            let user = snap
                .active_user(item.assignee_id.trim())
                .ok_or_else(|| ApiError::bad("开发负责人不存在或已停用"))?;
            if !(user.can_dev() || user.can_plan()) {
                return Err(ApiError::bad(format!(
                    "{} 没有开发身份，不能指派为开发负责人",
                    user.name
                )));
            }
            let wrong_platform =
                !user.platforms.is_empty() && !user.can_plan() && !user.owns_platform(&platform_id);
            (user.id.clone(), user.name.clone(), wrong_platform)
        };
        if wrong_platform {
            return Err(ApiError::bad(format!(
                "{} 不负责这个平台，不能指派为开发负责人",
                uname
            )));
        }
        snap.requirements[index].ensure_dev_tasks();
        if snap.requirements[index]
            .dev_tasks
            .iter()
            .any(|task| task.platform_id == platform_id && task.status == DEV_DONE)
        {
            return Err(ApiError::conflict("开发任务已完成，请先重开再改派"));
        }
        if let Some(task) = snap.requirements[index].dev_task_mut(&platform_id) {
            task.assignee_id = Some(uid.clone());
            if task.status == DEV_UNASSIGNED {
                task.status = DEV_ASSIGNED.to_string();
            }
        }
        seen_platforms.push(platform_id.clone());
        let platform_label = platform_display_name(snap, &platform_id);
        assigned_notices.push((
            uid,
            "dev_assigned",
            format!("{} 指派了开发任务", snap.requirements[index].code),
            format!(
                "{}「{}」的 {} 平台开发任务指派给你。",
                snap.requirements[index].code, snap.requirements[index].title, platform_label
            ),
        ));
    }
    if let Some(raw) = assignments.tester_id.as_deref() {
        let id = raw.trim();
        if !id.is_empty() {
            let uid = {
                let user = snap
                    .active_user(id)
                    .ok_or_else(|| ApiError::bad("测试负责人不存在或已停用"))?;
                if !user.can_test() {
                    return Err(ApiError::bad(format!(
                        "{} 没有测试身份，不能指派为测试负责人",
                        user.name
                    )));
                }
                user.id.clone()
            };
            snap.requirements[index].tester_id = Some(uid.clone());
            assigned_notices.push((
                uid,
                "test_assigned",
                format!("{} 指派了测试", snap.requirements[index].code),
                format!(
                    "{}「{}」的测试由你负责。",
                    snap.requirements[index].code, snap.requirements[index].title
                ),
            ));
        }
    }
    let requirement = snap.requirements[index].clone();
    let reviewers = requirement.reviewer_ids.clone();
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
    for (user_id, kind, title, body) in assigned_notices {
        if user_id != actor.id {
            snap.notify(&user_id, kind, Some(&requirement.id), &title, &body);
        }
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.submitted",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({
            "code": requirement.code,
            "version": version,
            "platformIds": requirement.platform_ids,
            "designStatus": requirement.design_status,
            "designerId": requirement.designer_id,
            "testerId": requirement.tester_id,
            "dev": requirement.dev_tasks.iter()
                .filter_map(|task| task.assignee_id.as_ref().map(|assignee| json!({"platformId": task.platform_id, "assigneeId": assignee})))
                .collect::<Vec<_>>(),
        }),
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
    let index = req_index(snap, reference, actor)?;
    check_not_creating(&snap.requirements[index], "评审")?;
    if snap.requirements[index].status != STATUS_PENDING_REVIEW {
        return Err(ApiError::conflict(format!(
            "只有待评审的需求可以评审，当前是「{}」",
            status_label(&snap.requirements[index].status)
        )));
    }
    let reviewers = &snap.requirements[index].reviewer_ids;
    if reviewers.is_empty() {
        return Err(ApiError::conflict(
            "需求还没有配置会签人，请先在迭代设置或 /req-reviewers 里指定",
        ));
    }
    let submitter = snap.requirements[index]
        .versions
        .last()
        .map(|version| version.by.as_str());
    if submitter == Some(actor.id.as_str()) && !actor.has_role(ROLE_ADMIN) {
        return Err(ApiError::forbidden("不能评审自己提交的需求"));
    }
    let allowed = actor.has_role(ROLE_ADMIN) || reviewers.contains(&actor.id);
    if !allowed {
        return Err(ApiError::forbidden(format!(
            "{} 不在这个需求的会签人列表里",
            actor.name
        )));
    }
    let decision = match input.decision.as_str() {
        "approve" | "approved" | "通过" => "approved",
        "reject" | "rejected" | "退回" => "rejected",
        "comment" | "comment_only" | "评论" => "comment",
        _ => return Err(ApiError::bad("decision 只能是 approve / reject / comment")),
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
    if decision == "comment" {
        // 仅评论留痕：不改状态、不计入会签，也不阻塞流程。
        snap.requirements[index].updated_at = crate::now_iso();
        let requirement_id = snap.requirements[index].id.clone();
        let iteration_id = snap.requirements[index].iteration_id.clone();
        snap.mark_requirement_notifications_read(&actor.id, &requirement_id);
        snap.push_event(
            Some(&actor.id),
            "requirement.review_commented",
            Some(&requirement_id),
            Some(&iteration_id),
            json!({ "version": round }),
        );
        return Ok((snap.requirements[index].clone(), review));
    }
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
        let count = reviewer_ids
            .iter()
            .filter(|id| approved.contains(*id))
            .count();
        (rejected, count)
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
    snap.mark_requirement_notifications_read(&actor.id, &requirement.id);
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
    let approved_ids: HashSet<&str> = requirement
        .reviews
        .iter()
        .filter(|review| review.version == round && review.decision == "approved")
        .map(|review| review.by.as_str())
        .collect();
    for reviewer in &reviewer_ids {
        if reviewer != &actor.id
            && !approved_ids.contains(reviewer.as_str())
            && requirement.status == STATUS_PENDING_REVIEW
        {
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
    let index = req_index(snap, reference, actor)?;
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
    if clean.is_empty() {
        return Err(ApiError::bad(
            "至少需要一名会签人；留空会让任何负责人一次通过就结束评审",
        ));
    }
    let previous = snap.requirements[index].reviewer_ids.clone();
    let unchanged = previous.len() == clean.len() && previous.iter().all(|id| clean.contains(id));
    let round = snap.requirements[index].versions.len() as u32;
    // 本轮已经投过 reject 的会签人不能被移出列表：否则负责人先把驳回意见“删掉”，
    // 剩下的会签人全通过时需求就直接变成已通过，评审等于被绕过。
    let rejected_out = snap.requirements[index].reviews.iter().any(|review| {
        review.version == round
            && review.decision == "rejected"
            && previous.contains(&review.by)
            && !clean.contains(&review.by)
    });
    if rejected_out {
        return Err(ApiError::conflict(
            "本轮已有会签人退回，不能把退回人移出会签列表；请让产品修改后重新提交",
        ));
    }
    snap.requirements[index].reviewer_ids = clean.clone();
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
    /// 排期时按端填的估时（人天）；不传就保持原值。
    #[serde(default)]
    pub estimates: Vec<EstimateInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateInput {
    pub platform_id: String,
    pub days: f64,
    /// 该端的排期窗口（可选），用于多端并行排期与联调先后。
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    /// 依赖的其他端 platform_id。
    #[serde(default)]
    pub depends_on: Vec<String>,
}

pub fn schedule_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: ScheduleInput,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "排期需求的")?;
    let index = req_index(snap, reference, actor)?;
    check_not_creating(&snap.requirements[index], "排期")?;
    ensure_status(
        &snap.requirements[index],
        &[STATUS_APPROVED, STATUS_SCHEDULED],
        "排期",
    )?;
    if !snap.requirements[index].in_scope {
        return Err(ApiError::conflict("需求不在本期范围内，先用范围调整纳入"));
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
    // 估时按端记在开发任务上；平台和数值先全部校验完再落，免得排期写成一半。
    if !input.estimates.is_empty() {
        for item in &input.estimates {
            if !snap.requirements[index]
                .platform_ids
                .contains(&item.platform_id)
            {
                return Err(ApiError::bad(format!(
                    "平台 {} 不在需求涉及范围内",
                    item.platform_id
                )));
            }
            if !item.days.is_finite() || item.days <= 0.0 || item.days > 365.0 {
                return Err(ApiError::bad("估时要在 0~365 人天之间"));
            }
            for dep in &item.depends_on {
                if dep == &item.platform_id {
                    return Err(ApiError::bad("不能依赖自己这个端"));
                }
                if !snap.requirements[index].platform_ids.contains(dep) {
                    return Err(ApiError::bad(format!("依赖的端 {dep} 不在需求涉及范围内")));
                }
            }
        }
        snap.requirements[index].ensure_dev_tasks();
        for item in &input.estimates {
            let depends_on = item.depends_on.clone();
            let start = match item.start_date.as_deref() {
                Some(value) => Some(validate_date(Some(value), "开始日期")?),
                None => None,
            };
            let end = match item.end_date.as_deref() {
                Some(value) => Some(validate_date(Some(value), "结束日期")?),
                None => None,
            };
            if let (Some(start), Some(end)) = (&start, &end) {
                if !start.is_empty() && !end.is_empty() && start > end {
                    return Err(ApiError::bad("按端排期的开始日期不能晚于结束日期"));
                }
            }
            if let Some(task) = snap.requirements[index].dev_task_mut(&item.platform_id) {
                task.estimate_days = Some(item.days);
                task.planned_start_date = start.filter(|value| !value.is_empty());
                task.planned_end_date = end.filter(|value| !value.is_empty());
                task.depends_on = depends_on;
            }
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
    let mut estimates = serde_json::Map::new();
    for task in &requirement.dev_tasks {
        if let Some(days) = task.estimate_days {
            estimates.insert(task.platform_id.clone(), json!(days));
        }
    }
    let estimate_total: f64 = requirement
        .dev_tasks
        .iter()
        .filter_map(|task| task.estimate_days)
        .sum();
    let estimate_note = if estimate_total > 0.0 {
        format!("估时合计 {} 人天。", estimate_total)
    } else {
        String::new()
    };
    snap.notify(
        &requirement.owner_id,
        "requirement.scheduled",
        Some(&requirement.id),
        &format!("{} 已排期", requirement.code),
        &format!(
            "计划 {} ~ {}。{}",
            requirement.planned_start_date.as_deref().unwrap_or("待定"),
            requirement.planned_end_date.as_deref().unwrap_or("待定"),
            estimate_note
        ),
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.scheduled",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({
            "startDate": requirement.planned_start_date,
            "endDate": requirement.planned_end_date,
            "estimates": estimates
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
    let index = req_index(snap, reference, actor)?;
    ensure_status(
        &snap.requirements[index],
        &[
            STATUS_APPROVED,
            STATUS_SCHEDULED,
            STATUS_IN_PROGRESS,
            STATUS_DEV_DONE,
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
    let reason = input.reason.trim();
    if !input.in_scope && reason.is_empty() {
        return Err(ApiError::bad("移出本期范围必须填写原因"));
    }
    if reason.chars().count() > 500 {
        return Err(ApiError::bad("范围变更原因不能超过 500 字"));
    }
    if reason.chars().any(char::is_control) {
        return Err(ApiError::bad("范围变更原因不能包含控制字符"));
    }
    let at = crate::now_iso();
    snap.requirements[index].in_scope = input.in_scope;
    snap.requirements[index].scope_changes.push(ScopeChange {
        at: at.clone(),
        by: actor.id.clone(),
        in_scope: input.in_scope,
        reason: reason.to_string(),
    });
    snap.requirements[index].status = if input.in_scope {
        let tasks = &snap.requirements[index].dev_tasks;
        let all_dev_done = !tasks.is_empty() && tasks.iter().all(|task| task.finished_at.is_some());
        let any_dev_started = tasks
            .iter()
            .any(|task| task.started_at.is_some() || task.finished_at.is_some());
        if all_dev_done {
            STATUS_DEV_DONE.to_string()
        } else if any_dev_started {
            STATUS_IN_PROGRESS.to_string()
        } else if snap.requirements[index].planned_start_date.is_some()
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
        &if reason.is_empty() {
            format!("当前状态：{}。", status_label(&requirement.status))
        } else {
            format!(
                "{}。当前状态：{}。",
                reason,
                status_label(&requirement.status)
            )
        },
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
    let index = req_index(snap, reference, actor)?;
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
    snap.mark_requirement_notifications_read(&actor.id, &requirement.id);
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
    let index = req_index(snap, reference, actor)?;
    check_not_creating(&snap.requirements[index], "交付设计")?;
    if snap.requirements[index].design_status == DESIGN_NONE {
        return Err(ApiError::conflict("该需求标记为无需设计"));
    }
    if ![DESIGN_DESIGNING, DESIGN_DELIVERED, DESIGN_CHANGES]
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
    let raw_summary = validate_long_text(&input.summary, "设计交付说明", 500)?;
    let summary = if raw_summary.is_empty() {
        format!("d{version} 设计交付")
    } else {
        raw_summary
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
    // 文件列表非空但一个附件都没挂上：多半是上传路径写错。这种“空版本”不能落库，
    // 否则其他人打开版本记录什么都看不到，还以为是设计交付了。
    if !input.files.is_empty() && artifact_ids.is_empty() {
        return Err(ApiError::conflict(
            "设计文件没有附上（附件为空），请检查文件路径后重新交付",
        ));
    }
    for artifact in &mut snap.requirements[index].artifacts {
        // 首次交付时给附件打版本；后续交付再引用同一文件不改写它的归属版本。
        if artifact.design_version.is_none() && artifact_ids.iter().any(|id| id == &artifact.id) {
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
    // 「设计晚于开发更新」只在开发已经开工时成立：开发没开始时改几版设计
    // 都不存在返工，卡片不该挂返工提示。
    if dev_started {
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
            "late": dev_started
        }),
    );
    Ok(requirement)
}

/// 删除尚未交付的设计：清空设计附件、释放认领，并把设计会话归档。
/// 已交付的版本不能删，否则开发正在依据的稿子会凭空消失。
pub fn reset_design(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference, actor)?;
    check_not_creating(&snap.requirements[index], "删除设计")?;
    if snap.requirements[index].design_status == DESIGN_NONE {
        return Err(ApiError::conflict("该需求标记为无需设计"));
    }
    if snap.requirements[index].design_status == DESIGN_DELIVERED
        || !snap.requirements[index].design_versions.is_empty()
    {
        return Err(ApiError::conflict(
            "设计已交付，不能删除；需要返工时请重新交付一版",
        ));
    }
    let is_holder = snap.requirements[index].designer_id.as_deref() == Some(actor.id.as_str());
    if !is_holder && !actor.can_plan() {
        return Err(ApiError::forbidden("只有设计负责人或负责人可以删除设计"));
    }
    let design_artifact_ids: HashSet<String> = snap.requirements[index]
        .artifacts
        .iter()
        .filter(|artifact| artifact.kind == "design")
        .map(|artifact| artifact.id.clone())
        .collect();
    snap.requirements[index]
        .artifacts
        .retain(|artifact| artifact.kind != "design");
    snap.artifact_contents
        .retain(|item| !design_artifact_ids.contains(&item.id));
    snap.requirements[index].design_versions.clear();
    snap.requirements[index].designer_id = None;
    snap.requirements[index].design_status = DESIGN_UNCLAIMED.to_string();
    snap.requirements[index].design_delivered_at = None;
    snap.requirements[index].design_updated_at = None;
    // 会话记录归档而不是删除：旧对话仍留在 DSH 历史里，需求页不再挂着它。
    for session in &mut snap.requirements[index].sessions {
        if session.kind == "design" {
            session.archived = true;
        }
    }
    let primary_archived = snap.requirements[index]
        .primary_session_id
        .as_deref()
        .is_some_and(|id| {
            snap.requirements[index]
                .sessions
                .iter()
                .any(|session| session.id == id && session.archived)
        });
    if primary_archived {
        snap.requirements[index].primary_session_id = snap.requirements[index]
            .sessions
            .iter()
            .find(|session| !session.archived && session.kind == "requirement")
            .or_else(|| {
                snap.requirements[index]
                    .sessions
                    .iter()
                    .find(|session| !session.archived)
            })
            .map(|session| session.id.clone());
    }
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.push_event(
        Some(&actor.id),
        "design.reset",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"artifacts": design_artifact_ids.len()}),
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
    let index = req_index(snap, reference, actor)?;
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
    // 被指派人如果不负责这个平台，开发会话里的后续动作全部会被平台校验挡住。
    if !assignee.can_plan()
        && !assignee.platforms.is_empty()
        && !assignee.owns_platform(&input.platform_id)
    {
        return Err(ApiError::bad(format!(
            "{} 不负责 {} 平台，不能指派为这个平台的开发负责人",
            assignee_name, input.platform_id
        )));
    }
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
    let platform_label = platform_display_name(snap, &input.platform_id);
    snap.notify(
        &input.assignee_id,
        "dev_assigned",
        Some(&requirement.id),
        &format!("{} 指派了开发任务", requirement.code),
        &format!(
            "{}「{}」的 {} 平台开发任务指派给你。",
            requirement.code, requirement.title, platform_label
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
    if !actor.can_plan() && !actor.platforms.is_empty() && !actor.owns_platform(platform_id) {
        return Err(ApiError::forbidden(format!(
            "{} 不负责这个平台",
            actor.name
        )));
    }
    let index = req_index(snap, reference, actor)?;
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
    snap.mark_requirement_notifications_read(&actor.id, &requirement.id);
    snap.push_event(
        Some(&actor.id),
        "requirement.dev_claimed",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"platformId": platform_id}),
    );
    Ok(requirement)
}

pub fn dev_start(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    platform_id: &str,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference, actor)?;
    check_dev_status(&snap.requirements[index], "开始开发")?;
    if matches!(
        snap.requirements[index].status.as_str(),
        STATUS_DEV_DONE | STATUS_TEST_PASSED
    ) {
        return Err(ApiError::conflict(
            "开发已完成/测试已通过，不能再次开始开发；如需返工请先走重开流程",
        ));
    }
    check_platform(&snap.requirements[index], platform_id)?;
    if !snap.requirements[index].in_scope {
        return Err(ApiError::conflict("需求不在本期范围内，不能开始开发"));
    }
    snap.requirements[index].ensure_dev_tasks();
    if let Some(task) = snap.requirements[index]
        .dev_tasks
        .iter()
        .find(|task| task.platform_id == platform_id)
    {
        if task.finished_at.is_some() || task.status == DEV_DONE {
            return Err(ApiError::conflict("这个平台任务已经完成开发，不能再次开始"));
        }
        if task.started_at.is_some() || task.status == DEV_IN_PROGRESS {
            return Err(ApiError::conflict("这个平台任务已经开始开发"));
        }
    }
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
    if first_start
        && requirement.design_status != DESIGN_DELIVERED
        && requirement.design_status != DESIGN_NONE
    {
        snap.notify(
            &requirement.owner_id,
            "design_pending",
            Some(&requirement.id),
            &format!("{} 开发已开始，设计未交付", requirement.code),
            "开发开始后交付的设计会标记为「设计已更新」。",
        );
        if let Some(designer) = requirement
            .designer_id
            .as_deref()
            .filter(|id| *id != requirement.owner_id.as_str())
        {
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
    /// 实际投入人天；不传就按 started_at→finished_at 推算。
    #[serde(default)]
    pub actual_days: Option<f64>,
    /// 阻塞原因/超时说明，用于估时偏差复盘。
    #[serde(default)]
    pub blocked_reason: Option<String>,
}

pub fn dev_finish(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
    input: DevFinishInput,
    mock_integration: bool,
) -> Result<Requirement, ApiError> {
    let index = req_index(snap, reference, actor)?;
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
        task.note = validate_long_text(&input.note, "开发说明", 2000)?;
        // 实际耗时：优先用手填值，否则按开始到完成的时间差折算（保留 1 位小数）。
        let derived_days = task.started_at.as_deref().and_then(|started| {
            let began = chrono::DateTime::parse_from_rfc3339(started).ok()?;
            let ended = chrono::DateTime::parse_from_rfc3339(at.as_str()).ok()?;
            let secs = (ended - began).num_seconds().max(0) as f64;
            Some(((secs / 86400.0) * 10.0).round() / 10.0)
        });
        task.actual_days = input.actual_days.or(derived_days);
        if let Some(reason) = input
            .blocked_reason
            .as_deref()
            .map(str::trim)
            .filter(|reason| !reason.is_empty())
        {
            task.blocked_reason = Some(reason.to_string());
        }
        task.branch = Some(format!("feature/{}-{}", code.to_lowercase(), platform_id));
        if mock_integration {
            // 没有配置 GitLab 时才生成演示 MR/流水线；配置后必须等真实调用结果，
            // 否则一次失败的集成会留下“已成功”的假象。
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
    let index = req_index(snap, reference, actor)?;
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
    // 重开会把已完成的开发拉回进行中，产品和其他平台的开发都要知道。
    let mut reopen_targets: Vec<String> = vec![requirement.owner_id.clone()];
    reopen_targets.extend(
        dev_assignee_ids(&requirement)
            .into_iter()
            .filter(|id| id != &actor.id),
    );
    for target in reopen_targets {
        if target == actor.id {
            continue;
        }
        snap.notify(
            &target,
            "requirement.dev_reopened",
            Some(&requirement.id),
            &format!("{} 重开开发", requirement.code),
            &format!("{} 把 {} 平台的开发重新打开了。", actor.name, platform_id),
        );
    }
    snap.push_event(
        Some(&actor.id),
        "requirement.dev_reopened",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"platformId": platform_id}),
    );
    Ok(requirement)
}

/// 认领测试：和设计一样是「这条需求由谁负责测试」的标记，不代替测试轮次。
pub fn claim_test(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    if !actor.can_test() {
        return Err(ApiError::forbidden(format!(
            "{} 没有认领测试的权限（需要测试/负责人/管理员身份）",
            actor.name
        )));
    }
    let index = req_index(snap, reference, actor)?;
    check_not_creating(&snap.requirements[index], "认领测试")?;
    ensure_status(
        &snap.requirements[index],
        &[
            STATUS_DEV_DONE,
            STATUS_TESTING,
            STATUS_TEST_FAILED,
            STATUS_TEST_PASSED,
        ],
        "认领测试",
    )?;
    if let Some(holder) = snap.requirements[index].tester_id.clone() {
        if holder != actor.id && !actor.can_plan() {
            return Err(ApiError::conflict(format!(
                "测试已由 {} 认领",
                user_name(snap, &holder)
            )));
        }
    }
    snap.requirements[index].tester_id = Some(actor.id.clone());
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.mark_requirement_notifications_read(&actor.id, &requirement.id);
    snap.push_event(
        Some(&actor.id),
        "requirement.test_claimed",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({"tester": actor.id}),
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
    let index = req_index(snap, reference, actor)?;
    ensure_status(
        &snap.requirements[index],
        &[STATUS_DEV_DONE, STATUS_TEST_FAILED, STATUS_TEST_PASSED],
        "开始测试",
    )?;
    if !snap.requirements[index].all_dev_done() {
        return Err(ApiError::conflict("还有平台没有完成开发"));
    }
    if let Some(holder) = snap.requirements[index].tester_id.clone() {
        if holder != actor.id && !actor.can_plan() {
            return Err(ApiError::conflict(format!(
                "测试已由 {} 认领，请等对方提交结论或由负责人改派",
                user_name(snap, &holder)
            )));
        }
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
    // 没指定测试负责人时，第一个开始测试的人就是这条需求的测试负责人。
    if snap.requirements[index].tester_id.is_none() {
        snap.requirements[index].tester_id = Some(actor.id.clone());
    }
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
    let parsed =
        reqwest::Url::parse(value).map_err(|_| ApiError::bad(format!("{label}不是合法 URL")))?;
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
    let index = req_index(snap, reference, actor)?;
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
                &format!("{}。请修复后重新提交测试。", test_note_text(note)),
            );
        }
        snap.notify(
            &requirement.owner_id,
            "test_failed",
            Some(&requirement.id),
            &format!("{} 测试不通过", requirement.code),
            &format!("{}。", test_note_text(note)),
        );
        // 测试不通过同样是负责人需要跟进的事，通过和不通过都要通知到。
        for planner in planner_ids(snap) {
            if planner == requirement.owner_id || planner == actor.id {
                continue;
            }
            snap.notify(
                &planner,
                "test_failed",
                Some(&requirement.id),
                &format!("{} 测试不通过", requirement.code),
                "测试不通过，请跟进修复进度。",
            );
        }
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

pub fn freeze(snap: &mut Snapshot, actor: &User, reference: &str) -> Result<Requirement, ApiError> {
    require_plan(actor, "冻结需求的")?;
    let index = req_index(snap, reference, actor)?;
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
    let index = req_index(snap, reference, actor)?;
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
    let index = req_index(snap, reference, actor)?;
    if snap.requirements[index].status != STATUS_FROZEN {
        return Err(ApiError::conflict("只有已冻结的需求可以发布"));
    }
    let raw_version = validate_short_text(&input.version, "发布版本号", 40)?;
    let version = if raw_version.is_empty() {
        "v1.0.0".to_string()
    } else {
        raw_version
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

/// 发布门禁（可选，由配置开启）：冻结/发布前必须有验收标准，且设计已交付或无需设计。
pub fn enforce_publish_gate(requirement: &Requirement) -> Result<(), ApiError> {
    if requirement.document.acceptance_criteria.trim().is_empty() {
        return Err(ApiError::conflict(
            "发布前请先补充验收标准（文档里的 acceptance criteria 不能为空）",
        ));
    }
    if !matches!(
        requirement.design_status.as_str(),
        DESIGN_NONE | DESIGN_DELIVERED
    ) {
        return Err(ApiError::conflict(
            "发布前请先完成设计交付，或标记为无需设计",
        ));
    }
    Ok(())
}

/// 发布后验收完成：released -> done，形成「发布即终态」之外的验收闭环。
pub fn complete_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "标记需求完成的")?;
    let index = req_index(snap, reference, actor)?;
    if snap.requirements[index].status != STATUS_RELEASED {
        return Err(ApiError::conflict("只有已发布的需求可以标记完成"));
    }
    snap.requirements[index].status = STATUS_DONE.to_string();
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.notify(
        &requirement.owner_id,
        "requirement.done",
        Some(&requirement.id),
        &format!("{} 已完成验收", requirement.code),
        "需求已标记为完成，进入历史归档。",
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.done",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({}),
    );
    Ok(requirement)
}

/// 废弃需求：任何未完成/未取消的需求都可以由负责人取消，进入「已取消」并移出本期。
pub fn cancel_requirement(
    snap: &mut Snapshot,
    actor: &User,
    reference: &str,
) -> Result<Requirement, ApiError> {
    require_plan(actor, "取消需求的")?;
    let index = req_index(snap, reference, actor)?;
    if matches!(
        snap.requirements[index].status.as_str(),
        STATUS_DONE | STATUS_CANCELLED
    ) {
        return Err(ApiError::conflict("需求已完成或已取消，无需再取消"));
    }
    snap.requirements[index].status = STATUS_CANCELLED.to_string();
    snap.requirements[index].in_scope = false;
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement = snap.requirements[index].clone();
    snap.notify(
        &requirement.owner_id,
        "requirement.cancelled",
        Some(&requirement.id),
        &format!("{} 已取消", requirement.code),
        "需求已标记为取消，移出本期范围并归档。",
    );
    snap.push_event(
        Some(&actor.id),
        "requirement.cancelled",
        Some(&requirement.id),
        Some(&requirement.iteration_id),
        json!({}),
    );
    Ok(requirement)
}

/// 两个提交版本之间的差异：文档（正文/验收/摘要）与原型屏增删。
pub fn version_diff(
    snap: &Snapshot,
    reference: &str,
    actor: &User,
    from: u32,
    to: u32,
) -> Result<serde_json::Value, ApiError> {
    let index = req_index(snap, reference, actor)?;
    let requirement = &snap.requirements[index];
    let pick = |v: u32| {
        requirement
            .versions
            .iter()
            .find(|item| item.version == v)
            .cloned()
            .ok_or_else(|| ApiError::not_found(format!("版本 v{v} 不存在")))
    };
    let from_version = pick(from)?;
    let to_version = pick(to)?;
    let from_doc = from_version.document.clone().unwrap_or_default();
    let to_doc = to_version.document.clone().unwrap_or_default();
    let screens = |v: u32| -> std::collections::BTreeSet<String> {
        requirement
            .prototype_versions
            .iter()
            .find(|item| item.version == v)
            .map(|item| {
                item.files
                    .iter()
                    .map(|file| file.name.clone())
                    .collect::<std::collections::BTreeSet<String>>()
            })
            .unwrap_or_default()
    };
    let from_screens = screens(from);
    let to_screens = screens(to);
    let added: Vec<String> = to_screens.difference(&from_screens).cloned().collect();
    let removed: Vec<String> = from_screens.difference(&to_screens).cloned().collect();
    Ok(json!({
        "from": from,
        "to": to,
        "versionSummary": { "from": from_version.summary, "to": to_version.summary },
        "document": {
            "summary": { "from": from_doc.summary, "to": to_doc.summary },
            "acceptanceCriteria": { "from": from_doc.acceptance_criteria, "to": to_doc.acceptance_criteria },
            "body": { "from": from_doc.body, "to": to_doc.body }
        },
        "prototypeScreens": { "added": added, "removed": removed }
    }))
}

/// 跨项目的人员负载总览：每个在岗成员在手未完成的开发任务数、估时人天与负责的需求数。
pub fn global_overview(snap: &Snapshot) -> serde_json::Value {
    use std::collections::HashMap;
    let open_states = [DEV_ASSIGNED, DEV_IN_PROGRESS];
    let mut per_user: HashMap<&str, (i64, f64, i64)> = HashMap::new();
    let mut total_requirements = 0i64;
    for requirement in &snap.requirements {
        if matches!(
            requirement.status.as_str(),
            STATUS_CREATING | STATUS_CREATE_FAILED
        ) {
            continue;
        }
        total_requirements += 1;
        per_user
            .entry(requirement.owner_id.as_str())
            .or_insert((0, 0.0, 0))
            .2 += 1;
    }
    let mut total_open_tasks = 0i64;
    for requirement in &snap.requirements {
        for task in &requirement.dev_tasks {
            let Some(assignee) = task.assignee_id.as_deref() else {
                continue;
            };
            if open_states.contains(&task.status.as_str()) {
                let entry = per_user.entry(assignee).or_insert((0, 0.0, 0));
                entry.0 += 1;
                entry.1 += task.estimate_days.unwrap_or(0.0);
                total_open_tasks += 1;
            }
        }
    }
    let mut users: Vec<serde_json::Value> = snap
        .users
        .iter()
        .filter(|user| user.active)
        .filter_map(|user| {
            per_user.get(user.id.as_str()).map(|(tasks, days, owned)| {
                json!({
                    "id": user.id,
                    "name": user.name,
                    "roles": user.roles,
                    "openTasks": tasks,
                    "openEstimateDays": days,
                    "ownedRequirements": owned,
                })
            })
        })
        .collect();
    users.sort_by(|a, b| {
        b["openTasks"]
            .as_i64()
            .cmp(&a["openTasks"].as_i64())
            .then_with(|| a["name"].as_str().cmp(&b["name"].as_str()))
    });
    json!({
        "users": users,
        "totals": {
            "requirements": total_requirements,
            "openTasks": total_open_tasks,
        }
    })
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
    let name = validate_short_text(input.name.as_deref().unwrap_or_default(), "平台组名称", 60)?;
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
        order: input
            .order
            .unwrap_or_else(|| next_order(&snap.groups, |item| item.order)),
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
    if let Some(raw_name) = input.name {
        let name = validate_short_text(&raw_name, "平台组名称", 60)?;
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
    let group = snap.groups[index].clone();
    snap.push_event(
        Some(&actor.id),
        "platform_group.updated",
        None,
        None,
        json!({"id": group.id, "name": group.name, "active": group.active}),
    );
    Ok(group)
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

// 平台负责人/接口人必须是真实存在的用户，否则通知、权限校验会指向一个不存在的账号。
fn platform_user_ids(
    snap: &Snapshot,
    ids: &[String],
    label: &str,
) -> Result<Vec<String>, ApiError> {
    let mut clean: Vec<String> = Vec::new();
    for id in ids {
        let id = id.trim();
        if id.is_empty() || clean.iter().any(|known| known == id) {
            continue;
        }
        if snap.user(id).is_none() {
            return Err(ApiError::bad(format!("{label}「{id}」不是已有用户")));
        }
        clean.push(id.to_string());
    }
    Ok(clean)
}

fn platform_owner_id(snap: &Snapshot, raw: Option<&str>) -> Result<Option<String>, ApiError> {
    let raw = raw.map(str::trim).filter(|id| !id.is_empty());
    if let Some(id) = raw {
        platform_user_ids(snap, std::slice::from_ref(&id.to_string()), "平台负责人")?;
    }
    Ok(raw.map(str::to_string))
}

pub fn create_platform(
    snap: &mut Snapshot,
    actor: &User,
    input: PlatformInput,
) -> Result<Platform, ApiError> {
    require_plan(actor, "配置平台的")?;
    let name = validate_short_text(input.name.as_deref().unwrap_or_default(), "平台名称", 60)?;
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
    let short_name = match input.short_name {
        Some(raw) => {
            let trimmed = validate_short_text(&raw, "平台简称", 24)?;
            if trimmed.is_empty() {
                validate_short_text(&name, "平台简称", 24)?
            } else {
                trimmed
            }
        }
        None => name.chars().take(24).collect(),
    };
    let order = input.order.unwrap_or_else(|| {
        next_order(
            &snap
                .platforms
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
        owner_id: platform_owner_id(snap, input.owner_id.as_deref())?,
        lead_ids: platform_user_ids(snap, &input.lead_ids.unwrap_or_default(), "平台接口人")?,
        gitlab_project_id: input.gitlab_project_id,
        gitlab_project_path: input.gitlab_project_path,
    };
    snap.platforms.push(platform.clone());
    snap.push_event(
        Some(&actor.id),
        "platform.created",
        None,
        None,
        json!({"id": platform.id, "name": platform.name, "groupId": platform.group_id}),
    );
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
    if let Some(raw_name) = input.name {
        let name = validate_short_text(&raw_name, "平台名称", 60)?;
        if name.is_empty() {
            return Err(ApiError::bad("平台名称不能为空"));
        }
        snap.platforms[index].name = name;
    }
    if let Some(raw_short) = input.short_name {
        let short_name = validate_short_text(&raw_short, "平台简称", 24)?;
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
        snap.platforms[index].owner_id = platform_owner_id(snap, input.owner_id.as_deref())?;
    }
    if let Some(lead_ids) = input.lead_ids {
        snap.platforms[index].lead_ids = platform_user_ids(snap, &lead_ids, "平台接口人")?;
    }
    if input.gitlab_project_id.is_some() {
        snap.platforms[index].gitlab_project_id =
            input.gitlab_project_id.filter(|id| !id.trim().is_empty());
    }
    if input.gitlab_project_path.is_some() {
        snap.platforms[index].gitlab_project_path = input
            .gitlab_project_path
            .filter(|path| !path.trim().is_empty());
    }
    let platform = snap.platforms[index].clone();
    snap.push_event(
        Some(&actor.id),
        "platform.updated",
        None,
        None,
        json!({"id": platform.id, "name": platform.name, "active": platform.active}),
    );
    Ok(platform)
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
        let name = group.name.clone();
        snap.push_event(
            Some(&actor.id),
            if active {
                "platform_group.restored"
            } else {
                "platform_group.archived"
            },
            None,
            None,
            json!({"id": id, "name": name}),
        );
    } else {
        let platform = snap
            .platforms
            .iter_mut()
            .find(|platform| platform.id == id)
            .ok_or_else(|| ApiError::not_found("平台不存在"))?;
        platform.active = active;
        let name = platform.name.clone();
        snap.push_event(
            Some(&actor.id),
            if active {
                "platform.restored"
            } else {
                "platform.archived"
            },
            None,
            None,
            json!({"id": id, "name": name}),
        );
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
    let mut allowed_ids: HashSet<String> = snap.users[index].platforms.iter().cloned().collect();
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

pub fn valid_role(role: &str) -> bool {
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
        // 团队技能也必须走审核；作者不能借“创建即 approved”给自己发权限。
        decision: None,
        comment: String::new(),
        reviewed_by: None,
        reviewed_at: None,
    };
    let skill = Skill {
        id: format!("skill-{}", uuid::Uuid::new_v4()),
        name: name.clone(),
        description: input.description.trim().to_string(),
        role_packs,
        scope: scope.to_string(),
        status: "pending_review".to_string(),
        owner_id: actor.id.clone(),
        versions: vec![version],
        usage_count: 0,
        disabled_projects: Vec::new(),
        created_at: at.clone(),
        updated_at: at,
    };
    snap.skills.push(skill.clone());
    for planner in planner_ids(snap) {
        if planner == actor.id {
            continue;
        }
        snap.notify(
            &planner,
            "skill_review_requested",
            None,
            &format!("技能 {name} 等待审核"),
            &format!(
                "{} 上传了{}技能「{name}」。",
                actor.name,
                if scope == "global" {
                    "团队"
                } else {
                    "个人"
                }
            ),
        );
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
        decision: None,
        comment: String::new(),
        reviewed_by: None,
        reviewed_at: None,
    });
    snap.skills[index].status = "pending_review".to_string();
    snap.skills[index].updated_at = at;
    let skill = snap.skills[index].clone();
    for planner in planner_ids(snap) {
        // 上传者自己就是负责人时不必再提醒自己。
        if planner == actor.id {
            continue;
        }
        snap.notify(
            &planner,
            "skill_review_requested",
            None,
            &format!("技能 {} v{version} 等待审核", skill.name),
            &format!("{} 上传了新版本。", actor.name),
        );
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
    if let Some(description) = input.description.as_deref() {
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
    let skill = snap.skills[index].clone();
    // 启用、归档、改适用角色都要能在审计日志里追到是谁改的。
    snap.push_event(
        Some(&actor.id),
        "skill.updated",
        None,
        None,
        json!({
            "name": skill.name,
            "status": skill.status,
            "rolePacks": skill.role_packs,
            "descriptionChanged": input.description.is_some(),
        }),
    );
    Ok(skill)
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
        latest.comment = bounded_text(&input.comment, "审核意见", 4_000)?;
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
        &skill.versions[skill.versions.len() - 1].comment,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillProjectsInput {
    #[serde(default)]
    pub disabled_projects: Vec<String>,
}

/// 记录一次技能被实际调用（调用方触发；这里只累加计数）。
pub fn record_skill_use(snap: &mut Snapshot, id: &str) -> Result<Skill, ApiError> {
    let index = snap
        .skills
        .iter()
        .position(|skill| skill.id == id)
        .ok_or_else(|| ApiError::not_found("技能不存在"))?;
    snap.skills[index].usage_count = snap.skills[index].usage_count.saturating_add(1);
    Ok(snap.skills[index].clone())
}

/// 配置技能在哪些项目里停用（仅管理员）。
pub fn set_skill_projects(
    snap: &mut Snapshot,
    actor: &User,
    id: &str,
    input: SkillProjectsInput,
) -> Result<Skill, ApiError> {
    if !actor.has_role(ROLE_ADMIN) {
        return Err(ApiError::forbidden("只有管理员可以配置技能的启用范围"));
    }
    let index = snap
        .skills
        .iter()
        .position(|skill| skill.id == id)
        .ok_or_else(|| ApiError::not_found("技能不存在"))?;
    let mut seen = HashSet::new();
    let mut list = Vec::new();
    for project in input.disabled_projects {
        let trimmed = project.trim().to_string();
        if trimmed.is_empty() || !seen.insert(trimmed.clone()) {
            continue;
        }
        if !snap.projects.iter().any(|item| item.id == trimmed) {
            return Err(ApiError::bad(format!("项目不存在：{trimmed}")));
        }
        list.push(trimmed);
    }
    snap.skills[index].disabled_projects = list;
    snap.skills[index].updated_at = crate::now_iso();
    Ok(snap.skills[index].clone())
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
    // 上限按字符数算：按字节算会让中文正文只拿到三分之一的额度。
    if value.chars().count() > max {
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
    let index = req_index(snap, reference, actor)?;
    check_not_creating(&snap.requirements[index], "编辑需求文档")?;
    // 有产品身份不等于能改任意需求的文档：只有这条需求的产品负责人，
    // 或负责人/管理员才能写，否则 A 产品可以把 B 产品的需求改成完全不同的内容。
    if snap.requirements[index].owner_id != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden(
            "只有这条需求的产品负责人或负责人/管理员可以编辑需求文档",
        ));
    }
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
    let compact: String = content
        .chars()
        .filter(|ch| !ch.is_ascii_whitespace())
        .collect();
    if compact.is_empty() || !compact.len().is_multiple_of(4) {
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
    let index = req_index(snap, reference, actor)?;
    check_not_creating(&snap.requirements[index], "上传附件")?;
    let kind = match input.kind.trim() {
        "design" => "design",
        // 产品原型由产品本机自动同步成附件：原型和设计稿一样要对评审/设计/
        // 开发/测试可见，不能退化成普通附件。
        "prototype" => "prototype",
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
    // 原型和测试报告会被宿主写进每个人的本机需求目录（mirrorPrototypesForUser），
    // 所以必须和设计稿一样有角色门槛：否则任何登录用户都能往别人的原型目录里写文件，
    // 或者伪造一份“测试通过”的证据。
    if kind == "prototype" && snap.requirements[index].owner_id != actor.id && !actor.can_plan() {
        return Err(ApiError::forbidden(format!(
            "{} 不是这条需求的产品负责人，不能上传原型",
            actor.name
        )));
    }
    if kind == "test-report" && !actor.can_test() {
        return Err(ApiError::forbidden(format!(
            "{} 没有上传测试报告的权限（需要测试/负责人/管理员身份）",
            actor.name
        )));
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
    // 附件正文存在快照 JSON 里；只限单文件不够，累计几百个 3 MB 附件会把每次
    // 状态读取和整份快照写放大到不可用。这里限制每条需求的附件数量和总字节数。
    let existing_bytes = snap.requirements[index]
        .artifacts
        .iter()
        .fold(0usize, |sum, item| sum.saturating_add(item.size));
    if snap.requirements[index].artifacts.len() >= 100 {
        return Err(ApiError::bad("每条需求最多保存 100 个附件"));
    }
    if existing_bytes.saturating_add(decoded_size) > 50 * 1024 * 1024 {
        return Err(ApiError::bad("每条需求的附件总量不能超过 50 MB"));
    }
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
        // 上传时只是把文件放上来，归入哪一版要到交付那一刻才知道；版本号在
        // deliver_design 里按交付次数生成，所以这里不能猜一个现有的 dN，否则
        // 为 d2 上传的稿子会被标成 d1。显式指定版本的附件才在这里打标。
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
                None
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

/// 需求参与人：负责人、设计师、会签人、开发负责人、建过会话的人、写过评审/测试的人，
/// 以及负责人/管理员。设计稿、原型、测试报告本来就镜像到全团队本机，不做限制；
/// 普通附件（日志、截图、客户资料）只有参与人能读。
fn is_requirement_participant(requirement: &Requirement, actor: &User) -> bool {
    actor.can_plan()
        || requirement.owner_id == actor.id
        || requirement.designer_id.as_deref() == Some(actor.id.as_str())
        || requirement.reviewer_ids.iter().any(|id| id == &actor.id)
        || requirement
            .dev_tasks
            .iter()
            .any(|task| task.assignee_id.as_deref() == Some(actor.id.as_str()))
        || requirement
            .sessions
            .iter()
            .any(|session| session.created_by.as_deref() == Some(actor.id.as_str()))
        || requirement
            .reviews
            .iter()
            .any(|review| review.by == actor.id)
        || requirement.test_runs.iter().any(|run| run.by == actor.id)
}

/// 同样的可见性校验，但只返回元数据：正文由调用方按 id 单独读取，
/// 这样只读接口不必把全部附件正文加载进内存。
pub fn artifact_for(snap: &Snapshot, actor: &User, id: &str) -> Result<ArtifactMeta, ApiError> {
    let requirement = snap
        .requirements
        .iter()
        .find(|requirement| {
            requirement
                .artifacts
                .iter()
                .any(|artifact| artifact.id == id)
        })
        .ok_or_else(|| ApiError::not_found("附件不存在"))?;
    let artifact = requirement
        .artifacts
        .iter()
        .find(|artifact| artifact.id == id)
        .ok_or_else(|| ApiError::not_found("附件不存在"))?;
    let shared_kind = matches!(
        artifact.kind.as_str(),
        "design" | "prototype" | "test-report"
    );
    if !shared_kind && !is_requirement_participant(requirement, actor) {
        // 用 404 而不是 403：不确认「这个 id 存在」本身就是信息。
        return Err(ApiError::not_found("附件不存在"));
    }
    Ok(artifact.clone())
}

/// 删除附件。产品本机删掉或改了名的原型由宿主用它清掉服务端旧文件，
/// 否则其他角色还会看到已经不存在的屏，需求页的屏数也会越积越多。
pub fn delete_artifact(snap: &mut Snapshot, actor: &User, id: &str) -> Result<String, ApiError> {
    let index = snap
        .requirements
        .iter()
        .position(|requirement| {
            requirement
                .artifacts
                .iter()
                .any(|artifact| artifact.id == id)
        })
        .ok_or_else(|| ApiError::not_found("附件不存在"))?;
    check_not_creating(&snap.requirements[index], "删除附件")?;
    // 被已提交的需求版本或设计版本引用的文件是历史快照的一部分，删掉会让评审、
    // 开发回看版本时拿到 404。要换内容请上传新文件，旧的自然不再被最新版本引用。
    let referenced = snap.requirements[index]
        .prototype_versions
        .iter()
        .any(|version| version.files.iter().any(|file| file.artifact_id == id))
        || snap.requirements[index]
            .design_versions
            .iter()
            .any(|version| {
                version
                    .artifact_ids
                    .iter()
                    .any(|artifact_id| artifact_id == id)
            });
    if referenced {
        return Err(ApiError::conflict(
            "这个文件已被提交的需求版本或设计版本引用，不能删除；请上传新文件替换",
        ));
    }
    let meta = snap.requirements[index]
        .artifacts
        .iter()
        .find(|artifact| artifact.id == id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("附件不存在"))?;
    let allowed = actor.can_plan()
        || meta.created_by == actor.id
        || snap.requirements[index].owner_id == actor.id
        || match meta.kind.as_str() {
            "design" => actor.can_design(),
            "test-report" => actor.can_test(),
            _ => false,
        };
    if !allowed {
        return Err(ApiError::forbidden(format!(
            "{} 不能删除这个附件",
            actor.name
        )));
    }
    snap.requirements[index]
        .artifacts
        .retain(|artifact| artifact.id != id);
    snap.artifact_contents.retain(|item| item.id != id);
    snap.requirements[index].updated_at = crate::now_iso();
    let requirement_id = snap.requirements[index].id.clone();
    let iteration_id = snap.requirements[index].iteration_id.clone();
    snap.push_event(
        Some(&actor.id),
        "requirement.artifact_deleted",
        Some(&requirement_id),
        Some(&iteration_id),
        json!({"artifactId": meta.id, "name": meta.name, "kind": meta.kind}),
    );
    Ok(meta.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn snapshot_with(status: &str, codes: &[&str]) -> Snapshot {
        let requirements: Vec<Value> = codes
            .iter()
            .enumerate()
            .map(|(index, code)| {
                json!({
                    "id": format!("req-{index}"),
                    "code": code,
                    "title": format!("需求 {index}"),
                    "iterationId": "it-1",
                    "status": status,
                    "designStatus": "not_needed",
                    "ownerId": "u-1",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "updatedAt": "2026-01-01T00:00:00Z"
                })
            })
            .collect();
        serde_json::from_value(json!({
            "users": [],
            "groups": [],
            "platforms": [],
            "iterations": [{
                "id": "it-1",
                "code": "S1",
                "shortCode": "S1",
                "name": "迭代"
            }],
            "requirements": requirements,
            "skills": []
        }))
        .expect("fixture snapshot")
    }

    #[test]
    fn terminal_requirements_reject_further_edits() {
        for status in [STATUS_FROZEN, STATUS_RELEASED, STATUS_DONE] {
            let snap = snapshot_with(status, &["S1-001"]);
            let error = check_not_creating(&snap.requirements[0], "编辑")
                .expect_err("terminal status must be rejected");
            assert_eq!(error.status, axum::http::StatusCode::CONFLICT);
        }
        let snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        assert!(check_not_creating(&snap.requirements[0], "编辑").is_ok());
    }

    #[test]
    fn complete_requirement_moves_released_to_done() {
        let mut snap = snapshot_with(STATUS_RELEASED, &["S1-001"]);
        snap.users.push(user("u-9", &["lead"]));
        let updated = complete_requirement(&mut snap, &user("u-9", &["lead"]), "S1-001")
            .expect("released 可以标记完成");
        assert_eq!(updated.status, STATUS_DONE);
        let mut draft = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        draft.users.push(user("u-9", &["lead"]));
        assert!(complete_requirement(&mut draft, &user("u-9", &["lead"]), "S1-001").is_err());
    }

    #[test]
    fn cancel_requirement_marks_cancelled() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        snap.users.push(user("u-9", &["lead"]));
        let updated = cancel_requirement(&mut snap, &user("u-9", &["lead"]), "S1-001")
            .expect("draft 可以取消");
        assert_eq!(updated.status, STATUS_CANCELLED);
        assert!(!updated.in_scope);
        assert!(cancel_requirement(&mut snap, &user("u-9", &["lead"]), "S1-001").is_err());
    }

    #[test]
    fn next_code_uses_high_water_mark() {
        let snap = snapshot_with(STATUS_DRAFT, &["S1-001", "S1-007", "S2-100"]);
        let iteration = &snap.iterations[0];
        assert_eq!(next_code(&snap, iteration), "S1-008");
    }

    fn user(id: &str, roles: &[&str]) -> User {
        serde_json::from_value(json!({
            "id": id,
            "name": id,
            "roles": roles,
            "active": true,
        }))
        .expect("fixture user")
    }

    fn snapshot_with_artifact(kind: &str, owner_id: &str) -> Snapshot {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        snap.requirements[0].owner_id = owner_id.to_string();
        let requirement_id = snap.requirements[0].id.clone();
        snap.requirements[0].artifacts.push(ArtifactMeta {
            id: "art-1".to_string(),
            requirement_id,
            name: "f.txt".to_string(),
            kind: kind.to_string(),
            content_type: "text/plain".to_string(),
            encoding: String::new(),
            size: 3,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            created_by: owner_id.to_string(),
            design_version: None,
        });
        snap.artifact_contents.push(ArtifactContent {
            id: "art-1".to_string(),
            content: "abc".to_string(),
        });
        snap
    }

    #[test]
    fn plain_attachments_are_participant_only() {
        let snap = snapshot_with_artifact("attachment", "u-owner");
        let owner = user("u-owner", &["product"]);
        let stranger = user("u-stranger", &["dev"]);
        let lead = user("u-lead", &["lead"]);
        assert!(artifact_for(&snap, &owner, "art-1").is_ok());
        assert!(artifact_for(&snap, &lead, "art-1").is_ok());
        let error = artifact_for(&snap, &stranger, "art-1")
            .expect_err("non-participant must not read a plain attachment");
        assert_eq!(error.status, axum::http::StatusCode::NOT_FOUND);
    }

    #[test]
    fn shared_deliverable_kinds_stay_readable() {
        for kind in ["design", "prototype", "test-report"] {
            let snap = snapshot_with_artifact(kind, "u-owner");
            let stranger = user("u-stranger", &["dev"]);
            assert!(
                artifact_for(&snap, &stranger, "art-1").is_ok(),
                "{kind} must stay readable by everyone"
            );
        }
    }

    #[test]
    fn only_owner_or_planner_may_upload_prototypes() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        snap.requirements[0].owner_id = "u-owner".to_string();
        let owner = user("u-owner", &["product"]);
        let other_product = user("u-other", &["product"]);
        let dev = user("u-dev", &["dev"]);
        let input = || ArtifactInput {
            name: "prototype/a.html".to_string(),
            content_type: "text/html".to_string(),
            content: "<html></html>".to_string(),
            encoding: String::new(),
            kind: "prototype".to_string(),
            design_version: None,
        };
        assert!(add_artifact(&mut snap, &owner, "S1-001", input()).is_ok());
        assert!(add_artifact(&mut snap, &other_product, "S1-001", input()).is_err());
        assert!(add_artifact(&mut snap, &dev, "S1-001", input()).is_err());
    }

    #[test]
    fn only_testers_may_upload_test_reports() {
        let mut snap = snapshot_with(STATUS_TESTING, &["S1-001"]);
        let dev = user("u-dev", &["dev"]);
        let qa = user("u-qa", &["qa"]);
        let input = || ArtifactInput {
            name: "report.html".to_string(),
            content_type: "text/html".to_string(),
            content: "<html></html>".to_string(),
            encoding: String::new(),
            kind: "test-report".to_string(),
            design_version: None,
        };
        assert!(add_artifact(&mut snap, &dev, "S1-001", input()).is_err());
        assert!(add_artifact(&mut snap, &qa, "S1-001", input()).is_ok());
    }

    #[test]
    fn document_edits_are_owner_scoped() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        snap.requirements[0].owner_id = "u-owner".to_string();
        let owner = user("u-owner", &["product"]);
        let other_product = user("u-other", &["product"]);
        let lead = user("u-lead", &["lead"]);
        let body = || DocumentInput {
            summary: Some("摘要".to_string()),
            acceptance_criteria: None,
            body: None,
            expected_version: None,
        };
        assert!(update_requirement_document(&mut snap, &owner, "S1-001", body()).is_ok());
        assert!(update_requirement_document(&mut snap, &other_product, "S1-001", body()).is_err());
        assert!(update_requirement_document(&mut snap, &lead, "S1-001", body()).is_ok());
    }

    #[test]
    fn rejected_reviewer_cannot_be_removed() {
        let mut snap = snapshot_with(STATUS_PENDING_REVIEW, &["S1-001"]);
        // 会签人必须是真实的负责人账号，否则会先被用户存在性校验挡下。
        snap.users = vec![
            user("u-owner", &["product"]),
            user("u-a", &["lead"]),
            user("u-b", &["lead"]),
        ];
        snap.requirements[0].reviewer_ids = vec!["u-a".to_string(), "u-b".to_string()];
        snap.requirements[0].versions.push(Version {
            version: 1,
            summary: "v1".to_string(),
            at: "2026-01-01T00:00:00Z".to_string(),
            by: "u-owner".to_string(),
            document: None,
        });
        snap.requirements[0].reviews.push(Review {
            id: "rv-1".to_string(),
            version: 1,
            decision: "rejected".to_string(),
            comment: "不行".to_string(),
            at: "2026-01-01T00:00:00Z".to_string(),
            by: "u-b".to_string(),
        });
        // set_reviewers 本身要求负责人/管理员身份：这里模拟负责人改会签名单。
        let owner = user("u-owner", &["lead"]);
        let ids = |list: &[&str]| list.iter().map(|id| id.to_string()).collect::<Vec<_>>();
        let error = set_reviewers(&mut snap, &owner, "S1-001", ids(&["u-a"]))
            .expect_err("rejecting reviewer must not be removable this round");
        assert_eq!(error.status, axum::http::StatusCode::CONFLICT);
        assert!(set_reviewers(&mut snap, &owner, "S1-001", ids(&["u-a", "u-b"])).is_ok());
    }

    #[test]
    fn set_scope_restores_in_progress_and_dev_done() {
        let mut snap = snapshot_with(STATUS_IN_PROGRESS, &["S1-001"]);
        snap.requirements[0].in_scope = true;
        snap.requirements[0].dev_tasks = vec![DevTask {
            id: "dt-1".to_string(),
            platform_id: "web".to_string(),
            assignee_id: Some("u-dev".to_string()),
            status: DEV_IN_PROGRESS.to_string(),
            branch: None,
            mr_url: None,
            pipeline_status: None,
            pipeline_url: None,
            note: String::new(),
            started_at: Some("2026-11-01T00:00:00Z".to_string()),
            finished_at: None,
            estimate_days: None,
            planned_start_date: None,
            planned_end_date: None,
            depends_on: Vec::new(),
            actual_days: None,
            blocked_reason: None,
        }];
        let lead = user("u-lead", &["lead"]);
        let out = set_scope(
            &mut snap,
            &lead,
            "S1-001",
            ScopeInput {
                in_scope: false,
                reason: "暂缓".to_string(),
            },
        )
        .expect("move out");
        assert_eq!(out.status, STATUS_BACKLOG);
        let back = set_scope(
            &mut snap,
            &lead,
            "S1-001",
            ScopeInput {
                in_scope: true,
                reason: "恢复".to_string(),
            },
        )
        .expect("restore");
        assert_eq!(back.status, STATUS_IN_PROGRESS);
    }

    #[test]
    fn archive_session_prefers_requirement_session_and_iteration_blocks_pending() {
        let mut snap = snapshot_with(STATUS_PENDING_REVIEW, &["S1-001"]);
        snap.iterations.push(Iteration {
            id: "iter-2".to_string(),
            project_id: snap.iterations[0].project_id.clone(),
            code: "2026-S2".to_string(),
            short_code: "S2".to_string(),
            name: "Iter 2".to_string(),
            phase: "需求".to_string(),
            status: "planning".to_string(),
            start_date: String::new(),
            end_date: String::new(),
            owner_id: None,
            reviewer_ids: vec![],
            archived: false,
            closed_at: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        });
        snap.requirements[0].sessions = vec![
            SessionRecord {
                id: "s-dev".to_string(),
                kind: "dev".to_string(),
                label: "开发".to_string(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                created_by: Some("u-dev".to_string()),
                archived: false,
            },
            SessionRecord {
                id: "s-req-1".to_string(),
                kind: "requirement".to_string(),
                label: "主需求".to_string(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
                created_by: Some("u-lead".to_string()),
                archived: false,
            },
            SessionRecord {
                id: "s-req-2".to_string(),
                kind: "requirement".to_string(),
                label: "备用需求".to_string(),
                created_at: "2026-01-02T00:00:00Z".to_string(),
                created_by: Some("u-lead".to_string()),
                archived: false,
            },
        ];
        snap.requirements[0].primary_session_id = Some("s-req-1".to_string());
        let lead = user("u-lead", &["lead"]);
        let updated = archive_session(&mut snap, &lead, "S1-001", "s-req-1", true).unwrap();
        assert_eq!(updated.primary_session_id.as_deref(), Some("s-req-2"));

        let err = archive_iteration(&mut snap, &lead, "it-1", true)
            .expect_err("pending_review iteration must not archive");
        assert_eq!(err.status, axum::http::StatusCode::CONFLICT);
    }

    #[test]
    fn sqlite_deleted_artifact_does_not_resurrect_and_webhook_dedups() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::init_schema(&conn).unwrap();
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        let owner = user("u-owner", &["product"]);
        snap.users.push(owner.clone());
        snap.requirements[0].owner_id = owner.id.clone();
        let art = add_artifact(
            &mut snap,
            &owner,
            "S1-001",
            ArtifactInput {
                name: "prototype/a.html".to_string(),
                content_type: "text/html".to_string(),
                content: "<h1>A</h1>".to_string(),
                encoding: String::new(),
                kind: "prototype".to_string(),
                design_version: None,
            },
        )
        .unwrap();
        snap.push_event(
            None,
            "integration.gitlab_pipeline",
            Some("req-1"),
            None,
            json!({ "delivery": "uuid-delivery-1" }),
        );
        crate::db::save_snapshot(&conn, &mut snap).unwrap();
        assert!(crate::db::has_webhook_delivery(&conn, "uuid-delivery-1").unwrap());
        assert!(!crate::db::has_webhook_delivery(&conn, "uuid-delivery-2").unwrap());

        delete_artifact(&mut snap, &owner, &art.id).unwrap();
        crate::db::save_snapshot(&conn, &mut snap).unwrap();
        let reloaded = crate::db::load_snapshot(&conn).unwrap();
        assert!(!reloaded
            .artifact_contents
            .iter()
            .any(|item| item.id == art.id));
    }

    #[test]
    fn update_iteration_tracks_closed_at() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        let lead = user("u-lead", &["lead"]);
        let done = update_iteration(
            &mut snap,
            &lead,
            "it-1",
            IterationInput {
                code: None,
                name: None,
                phase: None,
                status: Some("done".to_string()),
                start_date: None,
                end_date: None,
                reviewer_ids: None,
                project_id: None,
            },
        )
        .unwrap();
        assert!(done.closed_at.is_some());
        let reopened = update_iteration(
            &mut snap,
            &lead,
            "it-1",
            IterationInput {
                code: None,
                name: None,
                phase: None,
                status: Some("in_progress".to_string()),
                start_date: None,
                end_date: None,
                reviewer_ids: None,
                project_id: None,
            },
        )
        .unwrap();
        assert!(reopened.closed_at.is_none());
    }

    // ---- 2026-11-26 审查修复的回归测试 ----

    fn dev_ready(status: &str) -> (Snapshot, Requirement) {
        let mut snap = snapshot_with(status, &["S1-001"]);
        snap.users = vec![
            user("u-1", &["product"]),
            user("u-lead", &["lead", "admin"]),
            user("u-dev-a", &["dev"]),
            user("u-dev-b", &["dev"]),
            user("u-qa", &["qa"]),
        ];
        snap.platforms = vec![serde_json::from_value(json!({
            "id": "web", "groupId": "g", "name": "web", "shortName": "web",
            "order": 1, "active": true, "leadIds": []
        }))
        .unwrap()];
        snap.groups = vec![serde_json::from_value(json!({
            "id": "g", "name": "组", "order": 1, "active": true
        }))
        .unwrap()];
        snap.requirements[0].platform_ids = vec!["web".into()];
        snap.requirements[0].in_scope = true;
        snap.requirements[0].ensure_dev_tasks();
        snap.requirements[0]
            .dev_task_mut("web")
            .unwrap()
            .assignee_id = Some("u-dev-a".into());
        let requirement = snap.requirements[0].clone();
        (snap, requirement)
    }

    #[test]
    fn drafts_are_invisible_to_non_planners_on_every_mutation() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        let owner = user("u-1", &["product"]);
        // 设计角色对草稿本来就有操作权限，这样才能验证挡住它的是可见性而不是角色。
        let designer = user("u-9", &["design"]);
        let lead = user("u-lead", &["lead"]);
        snap.users = vec![owner.clone(), designer.clone(), lead.clone()];
        // 非负责人连“存在”都不能知道：统一 404，而不是 403。
        let error = claim_design(&mut snap, &designer, "S1-001").expect_err("draft must be hidden");
        assert_eq!(error.status, axum::http::StatusCode::NOT_FOUND);
        // 提交之后（不再是草稿）同一个设计就能认领了：挡住它的确实是可见性，不是角色。
        snap.requirements[0].status = STATUS_APPROVED.into();
        snap.requirements[0].design_status = DESIGN_UNCLAIMED.into();
        assert!(claim_design(&mut snap, &designer, "S1-001").is_ok());
        // 创建人和负责人仍然可以操作草稿。
        snap.requirements[0].status = STATUS_DRAFT.into();
        assert!(record_session(&mut snap, &owner, "S1-001", "requirement", "").is_ok());
        assert!(record_session(&mut snap, &lead, "S1-001", "requirement", "").is_ok());
    }

    #[test]
    fn delete_is_blocked_once_others_have_worked_on_it() {
        let owner = user("u-1", &["product"]);
        let mut fresh = snapshot_with(STATUS_PENDING_REVIEW, &["S1-001"]);
        assert!(delete_requirement(&mut fresh, &owner, "S1-001").is_ok());

        let mut reviewed = snapshot_with(STATUS_PENDING_REVIEW, &["S1-001"]);
        reviewed.requirements[0].reviews.push(Review {
            id: "r-1".into(),
            version: 1,
            decision: "approved".into(),
            comment: String::new(),
            at: "2026-01-01T00:00:00Z".into(),
            by: "u-lead".into(),
        });
        let error =
            delete_requirement(&mut reviewed, &owner, "S1-001").expect_err("reviewed work stays");
        assert_eq!(error.status, axum::http::StatusCode::CONFLICT);

        let mut approved = snapshot_with(STATUS_APPROVED, &["S1-001"]);
        assert!(delete_requirement(&mut approved, &owner, "S1-001").is_err());
    }

    #[test]
    fn session_labels_are_bounded() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        let owner = user("u-1", &["product"]);
        let long = "标".repeat(81);
        assert!(record_session(&mut snap, &owner, "S1-001", "requirement", &long).is_err());
        let (_, record) =
            record_session(&mut snap, &owner, "S1-001", "requirement", "  需求会话  ").unwrap();
        assert_eq!(record.label, "需求会话");
        let designer = user("u-2", &["design"]);
        snap.users = vec![designer.clone()];
        snap.requirements[0].status = STATUS_APPROVED.into();
        let (_, record) = record_session(&mut snap, &designer, "S1-001", "design", "").unwrap();
        assert_eq!(record.label, session_type_label("design"));
    }

    #[test]
    fn moving_mid_review_keeps_the_reviewers_who_already_voted() {
        let mut snap = snapshot_with(STATUS_PENDING_REVIEW, &["S1-001"]);
        snap.users = vec![
            user("u-1", &["product"]),
            user("u-a", &["lead"]),
            user("u-b", &["lead"]),
        ];
        snap.requirements[0].reviewer_ids = vec!["u-a".into(), "u-b".into()];
        snap.iterations.push(
            serde_json::from_value(json!({
                "id": "it-2", "code": "S2", "shortCode": "S2", "name": "迭代 2",
                "reviewerIds": ["u-c"]
            }))
            .unwrap(),
        );
        let lead = user("u-lead", &["lead"]);
        let moved = move_requirement(&mut snap, &lead, "S1-001", "S2").unwrap();
        assert_eq!(
            moved.reviewer_ids,
            vec!["u-a".to_string(), "u-b".to_string()]
        );
    }

    #[test]
    fn reviewers_who_already_approved_are_not_reminded_again() {
        let mut snap = snapshot_with(STATUS_PENDING_REVIEW, &["S1-001"]);
        snap.users = vec![
            user("u-1", &["product"]),
            user("u-a", &["lead"]),
            user("u-b", &["lead"]),
            user("u-c", &["lead"]),
        ];
        snap.requirements[0].reviewer_ids = vec!["u-a".into(), "u-b".into(), "u-c".into()];
        snap.requirements[0].versions.push(Version {
            version: 1,
            summary: "v1".into(),
            at: "2026-01-01T00:00:00Z".into(),
            by: "u-1".into(),
            document: None,
        });
        let approve = || ReviewInput {
            decision: "approve".into(),
            comment: String::new(),
        };
        let a = user("u-a", &["lead"]);
        let b = user("u-b", &["lead"]);
        review_requirement(&mut snap, &a, "S1-001", approve()).unwrap();
        snap.pending_notifications.clear();
        review_requirement(&mut snap, &b, "S1-001", approve()).unwrap();
        let reminded: Vec<&str> = snap
            .pending_notifications
            .iter()
            .filter(|item| item.kind == "review_requested")
            .map(|item| item.user_id.as_str())
            .collect();
        assert_eq!(reminded, vec!["u-c"]);
    }

    #[test]
    fn default_platforms_come_from_group_order_not_demo_ids() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        snap.groups = ["back", "front", "hidden"]
            .iter()
            .enumerate()
            .map(|(index, id)| {
                serde_json::from_value(json!({
                    "id": id, "name": id, "order": index + 1, "active": id != &"hidden"
                }))
                .unwrap()
            })
            .collect();
        // 存储顺序故意打乱，同一组里有多个平台，排第一的不是先存进来的那个。
        snap.platforms = [
            ("beta", "back", 2),
            ("gamma", "front", 1),
            ("alpha", "back", 1),
            ("lost", "hidden", 1),
            ("delta", "front", 2),
            ("off", "back", 0),
        ]
        .iter()
        .map(|(id, group, order)| {
            serde_json::from_value(json!({
                "id": id, "groupId": group, "name": id, "shortName": id,
                "order": order, "active": id != &"off", "leadIds": []
            }))
            .unwrap()
        })
        .collect();
        let actor = user("u-1", &["product"]);
        // back 组取 alpha（已停用的 off 不算），front 组取 gamma；已归档的 hidden 组不参与。
        assert_eq!(
            default_platform_ids(&snap, &actor),
            vec!["alpha".to_string(), "gamma".to_string()]
        );
    }

    #[test]
    fn dev_assign_rejects_someone_who_does_not_own_the_platform() {
        let (mut snap, _) = dev_ready(STATUS_APPROVED);
        let lead = user("u-lead", &["lead"]);
        let mut outsider = user("u-dev-b", &["dev"]);
        outsider.platforms = vec!["ios".into()];
        snap.users[3] = outsider.clone();
        let input = || DevAssignInput {
            platform_id: "web".into(),
            assignee_id: "u-dev-b".into(),
        };
        let error =
            dev_assign(&mut snap, &lead, "S1-001", input()).expect_err("wrong platform owner");
        assert_eq!(error.status, axum::http::StatusCode::BAD_REQUEST);
        // 没有平台归属限制的开发可以指派。
        snap.users[3] = user("u-dev-b", &["dev"]);
        assert!(dev_assign(&mut snap, &lead, "S1-001", input()).is_ok());
    }

    #[test]
    fn reopening_dev_tells_the_owner_and_the_other_devs() {
        let (mut snap, _) = dev_ready(STATUS_DEV_DONE);
        let dev = user("u-dev-a", &["dev"]);
        let reopened = dev_reopen(&mut snap, &dev, "S1-001", "web").unwrap();
        assert_eq!(reopened.status, STATUS_IN_PROGRESS);
        let told: Vec<&str> = snap
            .pending_notifications
            .iter()
            .filter(|item| item.kind == "requirement.dev_reopened")
            .map(|item| item.user_id.as_str())
            .collect();
        assert_eq!(told, vec!["u-1"]);
    }

    #[test]
    fn only_the_claimed_tester_starts_a_test() {
        let (mut snap, _) = dev_ready(STATUS_DEV_DONE);
        let task = snap.requirements[0].dev_task_mut("web").unwrap();
        task.status = DEV_DONE.into();
        task.started_at = Some("2026-01-01T00:00:00Z".into());
        task.finished_at = Some("2026-01-02T00:00:00Z".into());
        let qa = user("u-qa", &["qa"]);
        claim_test(&mut snap, &qa, "S1-001").unwrap();
        let other_qa = user("u-qa-2", &["qa"]);
        snap.users.push(other_qa.clone());
        let error =
            test_start(&mut snap, &other_qa, "S1-001").expect_err("claimed by someone else");
        assert_eq!(error.status, axum::http::StatusCode::CONFLICT);
        assert!(test_start(&mut snap, &qa, "S1-001").is_ok());
    }

    #[test]
    fn failed_test_without_a_note_reads_naturally_and_reaches_leads() {
        let (mut snap, _) = dev_ready(STATUS_DEV_DONE);
        {
            let task = snap.requirements[0].dev_task_mut("web").unwrap();
            task.status = DEV_DONE.into();
            task.started_at = Some("2026-01-01T00:00:00Z".into());
            task.finished_at = Some("2026-01-02T00:00:00Z".into());
        }
        let qa = user("u-qa", &["qa"]);
        test_start(&mut snap, &qa, "S1-001").unwrap();
        snap.pending_notifications.clear();
        test_fail(
            &mut snap,
            &qa,
            "S1-001",
            TestResultInput {
                note: "   ".into(),
                bug_url: None,
            },
        )
        .unwrap();
        let failed: Vec<&NotificationDraft> = snap
            .pending_notifications
            .iter()
            .filter(|item| item.kind == "test_failed")
            .collect();
        assert!(failed.iter().any(|item| item.user_id == "u-lead"));
        assert!(
            failed.iter().all(|item| !item.body.starts_with('。')),
            "a missing note must not leave a stray full stop"
        );
    }

    #[test]
    fn later_design_deliveries_do_not_restamp_older_artifacts() {
        let mut snap = snapshot_with_artifact("design", "u-1");
        snap.requirements[0].design_status = DESIGN_DESIGNING.into();
        snap.requirements[0].designer_id = Some("u-1".into());
        let designer = user("u-1", &["design"]);
        let input = || DeliverDesignInput {
            summary: String::new(),
            files: Vec::new(),
            artifact_ids: vec!["art-1".to_string()],
        };
        deliver_design(&mut snap, &designer, "S1-001", input()).unwrap();
        assert_eq!(
            snap.requirements[0].artifacts[0].design_version.as_deref(),
            Some("d1")
        );
        deliver_design(&mut snap, &designer, "S1-001", input()).unwrap();
        assert_eq!(
            snap.requirements[0].artifacts[0].design_version.as_deref(),
            Some("d1"),
            "a file delivered again keeps the version it was first delivered in"
        );
        assert_eq!(snap.requirements[0].design_versions.len(), 2);
    }

    #[test]
    fn uploads_do_not_guess_a_design_version() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        snap.requirements[0].design_status = DESIGN_DESIGNING.into();
        snap.requirements[0].designer_id = Some("u-1".into());
        let designer = user("u-1", &["design"]);
        let upload = || ArtifactInput {
            name: "design/a.html".to_string(),
            content_type: "text/html".to_string(),
            content: "<html></html>".to_string(),
            encoding: String::new(),
            kind: "design".to_string(),
            design_version: None,
        };
        let deliver = |snap: &mut Snapshot, id: &str| {
            deliver_design(
                snap,
                &designer,
                "S1-001",
                DeliverDesignInput {
                    summary: String::new(),
                    files: vec!["design/a.html".to_string()],
                    artifact_ids: vec![id.to_string()],
                },
            )
            .unwrap();
        };
        let first = add_artifact(&mut snap, &designer, "S1-001", upload()).unwrap();
        deliver(&mut snap, &first.id);
        assert_eq!(first.design_version, None, "上传时不该猜版本");
        // 第二版交付前上传的稿子不能提前标成 d1；交付那一刻才归入 d2。
        let second = add_artifact(&mut snap, &designer, "S1-001", upload()).unwrap();
        assert_eq!(second.design_version, None);
        deliver(&mut snap, &second.id);
        let tagged = snap.requirements[0]
            .artifacts
            .iter()
            .find(|artifact| artifact.id == second.id)
            .unwrap();
        assert_eq!(tagged.design_version.as_deref(), Some("d2"));
    }

    #[test]
    fn design_updated_flag_needs_dev_already_started() {
        let mut snap = snapshot_with_artifact("design", "u-1");
        snap.requirements[0].design_status = DESIGN_DESIGNING.into();
        snap.requirements[0].designer_id = Some("u-1".into());
        snap.requirements[0].platform_ids = vec!["web".into()];
        snap.requirements[0].ensure_dev_tasks();
        let designer = user("u-1", &["design"]);
        let input = || DeliverDesignInput {
            summary: String::new(),
            files: Vec::new(),
            artifact_ids: vec!["art-1".to_string()],
        };
        // 开发还没开工：交到第二版也只是改设计，不存在返工。
        deliver_design(&mut snap, &designer, "S1-001", input()).unwrap();
        deliver_design(&mut snap, &designer, "S1-001", input()).unwrap();
        assert_eq!(snap.requirements[0].design_updated_at, None);
        // 开发开工后再交付的设计才标记「设计已更新」。
        snap.requirements[0].dev_tasks = Vec::new();
        snap.requirements[0].ensure_dev_tasks();
        snap.requirements[0].dev_task_mut("web").unwrap().started_at =
            Some("2026-01-01T00:00:00Z".into());
        deliver_design(&mut snap, &designer, "S1-001", input()).unwrap();
        assert!(snap.requirements[0].design_updated_at.is_some());
    }

    #[test]
    fn schedule_records_per_platform_estimates() {
        let mut snap = snapshot_with(STATUS_APPROVED, &["S1-001"]);
        snap.requirements[0].in_scope = true;
        snap.requirements[0].platform_ids = vec!["trade-server".into(), "web".into()];
        let lead = user("u-lead", &["lead"]);
        let saved = schedule_requirement(
            &mut snap,
            &lead,
            "S1-001",
            ScheduleInput {
                start_date: Some("2026-11-27".into()),
                end_date: Some("2026-12-01".into()),
                estimates: vec![
                    EstimateInput {
                        platform_id: "trade-server".into(),
                        days: 3.0,
                        start_date: None,
                        end_date: None,
                        depends_on: Vec::new(),
                    },
                    EstimateInput {
                        platform_id: "web".into(),
                        days: 2.5,
                        start_date: None,
                        end_date: None,
                        depends_on: Vec::new(),
                    },
                ],
            },
        )
        .expect("lead can schedule with estimates");
        assert_eq!(saved.status, STATUS_SCHEDULED);
        let web = saved
            .dev_tasks
            .iter()
            .find(|task| task.platform_id == "web")
            .expect("web task exists");
        assert_eq!(web.estimate_days, Some(2.5));
        // 不认识的平台、非正数估时都要拒绝，且不能把已有估时改坏。
        let error = schedule_requirement(
            &mut snap,
            &lead,
            "S1-001",
            ScheduleInput {
                start_date: None,
                end_date: None,
                estimates: vec![EstimateInput {
                    platform_id: "ios".into(),
                    days: 1.0,
                    start_date: None,
                    end_date: None,
                    depends_on: Vec::new(),
                }],
            },
        )
        .expect_err("unknown platform must be rejected");
        assert_eq!(error.status, StatusCode::BAD_REQUEST);
        let error = schedule_requirement(
            &mut snap,
            &lead,
            "S1-001",
            ScheduleInput {
                start_date: None,
                end_date: None,
                estimates: vec![EstimateInput {
                    platform_id: "web".into(),
                    days: 0.0,
                    start_date: None,
                    end_date: None,
                    depends_on: Vec::new(),
                }],
            },
        )
        .expect_err("zero estimate must be rejected");
        assert_eq!(error.status, StatusCode::BAD_REQUEST);
        assert_eq!(
            snap.requirements[0]
                .dev_tasks
                .iter()
                .find(|task| task.platform_id == "web")
                .unwrap()
                .estimate_days,
            Some(2.5),
            "被拒绝的排期不能改掉已有估时"
        );
    }

    #[test]
    fn design_delivery_with_files_but_no_attachments_is_rejected() {
        let mut snap = snapshot_with_artifact("design", "u-1");
        snap.requirements[0].design_status = DESIGN_DESIGNING.into();
        snap.requirements[0].designer_id = Some("u-1".into());
        let designer = user("u-1", &["design"]);
        let error = deliver_design(
            &mut snap,
            &designer,
            "S1-001",
            DeliverDesignInput {
                summary: String::new(),
                files: vec!["design/01-overview.html".into()],
                artifact_ids: Vec::new(),
            },
        )
        .expect_err("上传路径写错导致的空版本不能交付");
        assert_eq!(error.status, StatusCode::CONFLICT);
        assert!(snap.requirements[0].design_versions.is_empty());
    }

    #[test]
    fn reset_design_clears_claim_files_and_archives_sessions() {
        let mut snap = snapshot_with_artifact("design", "u-owner");
        snap.requirements[0].status = STATUS_APPROVED.into();
        snap.requirements[0].design_status = DESIGN_DESIGNING.into();
        snap.requirements[0].designer_id = Some("u-1".into());
        snap.requirements[0].sessions.push(
            serde_json::from_value(json!({
                "id": "sess-design",
                "type": "design",
                "createdBy": "u-1",
                "createdAt": "2026-01-01T00:00:00Z"
            }))
            .expect("design session fixture"),
        );
        snap.requirements[0].primary_session_id = Some("sess-design".into());
        let designer = user("u-1", &["design"]);
        let requirement = reset_design(&mut snap, &designer, "S1-001").expect("designer can reset");

        assert_eq!(requirement.design_status, DESIGN_UNCLAIMED);
        assert!(requirement.designer_id.is_none());
        assert!(requirement
            .artifacts
            .iter()
            .all(|item| item.kind != "design"));
        assert!(
            snap.artifact_contents.is_empty(),
            "artifact bodies must not linger"
        );
        assert!(requirement.sessions[0].archived);
        assert!(requirement.primary_session_id.is_none());
        assert!(snap
            .pending_events
            .iter()
            .any(|event| event.kind == "design.reset"));
    }

    #[test]
    fn delivered_design_cannot_be_reset() {
        let mut snap = snapshot_with_artifact("design", "u-owner");
        snap.requirements[0].status = STATUS_APPROVED.into();
        snap.requirements[0].design_status = DESIGN_DELIVERED.into();
        snap.requirements[0].designer_id = Some("u-1".into());
        let designer = user("u-1", &["design"]);
        let error = reset_design(&mut snap, &designer, "S1-001")
            .expect_err("a delivered design must stay intact");
        assert_eq!(error.status, StatusCode::CONFLICT);
    }

    #[test]
    fn only_holder_or_plan_can_reset_design() {
        let mut snap = snapshot_with_artifact("design", "u-owner");
        snap.requirements[0].status = STATUS_APPROVED.into();
        snap.requirements[0].design_status = DESIGN_DESIGNING.into();
        snap.requirements[0].designer_id = Some("u-1".into());
        let stranger = user("u-2", &["design"]);
        let error = reset_design(&mut snap, &stranger, "S1-001")
            .expect_err("another designer must not reset someone else's claim");
        assert_eq!(error.status, StatusCode::FORBIDDEN);
        let lead = user("u-lead", &["lead"]);
        assert!(reset_design(&mut snap, &lead, "S1-001").is_ok());
    }

    #[test]
    fn referenced_artifacts_cannot_be_deleted() {
        let mut snap = snapshot_with_artifact("prototype", "u-1");
        snap.requirements[0]
            .prototype_versions
            .push(PrototypeVersion {
                version: 1,
                files: vec![PrototypeVersionFile {
                    name: "首页.md".into(),
                    artifact_id: "art-1".into(),
                }],
                created_at: "2026-01-01T00:00:00Z".into(),
                created_by: "u-1".into(),
            });
        let owner = user("u-1", &["product"]);
        let error =
            delete_artifact(&mut snap, &owner, "art-1").expect_err("snapshot must stay intact");
        assert_eq!(error.status, axum::http::StatusCode::CONFLICT);
    }

    #[test]
    fn text_limits_count_characters_not_bytes() {
        // 4000 个汉字是 12000 字节：按字节算会被误拒。
        let summary = "摘".repeat(4000);
        assert!(bounded_text(&summary, "需求摘要", 4_000).is_ok());
        assert!(bounded_text(&format!("{summary}多"), "需求摘要", 4_000).is_err());
        assert_eq!(bounded_text("  正文  ", "正文", 10).unwrap(), "正文");
    }

    #[test]
    fn platform_people_must_be_real_users() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        snap.users = vec![user("u-1", &["lead"])];
        snap.groups = vec![serde_json::from_value(json!({
            "id": "g", "name": "组", "order": 1, "active": true
        }))
        .unwrap()];
        let lead = user("u-1", &["lead"]);
        let input = |owner: Option<&str>, leads: Vec<&str>| PlatformInput {
            name: Some("新平台".into()),
            short_name: None,
            group_id: Some("g".into()),
            order: None,
            active: None,
            owner_id: owner.map(str::to_string),
            lead_ids: Some(leads.into_iter().map(str::to_string).collect()),
            gitlab_project_id: None,
            gitlab_project_path: None,
        };
        let error = create_platform(&mut snap, &lead, input(Some("ghost"), vec![]))
            .expect_err("unknown owner");
        assert_eq!(error.status, axum::http::StatusCode::BAD_REQUEST);
        let created =
            create_platform(&mut snap, &lead, input(Some(" u-1 "), vec!["u-1", "u-1"])).unwrap();
        assert_eq!(created.owner_id.as_deref(), Some("u-1"));
        assert_eq!(
            created.lead_ids,
            vec!["u-1".to_string()],
            "duplicates and blanks are dropped"
        );
    }

    #[test]
    fn append_only_tables_are_pruned_but_unread_notifications_stay() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::init_schema(&conn).unwrap();
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        // 700 条已读 + 1 条未读，全部属于同一个用户：已读只留最近 500 条。
        for index in 0..700 {
            snap.push_event(
                None,
                "requirement.created",
                Some("req-0"),
                None,
                json!({ "index": index }),
            );
            snap.notify(
                "u-1",
                "test_failed",
                Some("req-0"),
                "t",
                &format!("read {index}"),
            );
        }
        crate::db::save_snapshot(&conn, &mut snap).unwrap();
        conn.execute("UPDATE notifications SET read = 1", [])
            .unwrap();
        snap.notify("u-1", "test_failed", Some("req-0"), "t", "unread one");
        crate::db::save_snapshot(&conn, &mut snap).unwrap();

        let kept = conn
            .query_row("SELECT COUNT(*) FROM notifications", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(
            kept, 501,
            "500 newest read notifications plus the unread one"
        );
        let unread = crate::db::unread_notifications(&conn, "u-1").unwrap();
        assert_eq!(unread, 1);
        // 700 条事件远低于 20000 的上限，一条都不该删。
        let events = conn
            .query_row("SELECT COUNT(*) FROM events", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(events, 700);
    }

    fn platform(id: &str, name: &str) -> Platform {
        serde_json::from_value(json!({
            "id": id, "groupId": "g", "name": name, "shortName": name,
            "order": 1, "active": true, "leadIds": []
        }))
        .expect("fixture platform")
    }

    #[test]
    fn submit_can_narrow_scope_before_dev_starts() {
        let mut snap = snapshot_with(STATUS_DRAFT, &["S1-001"]);
        snap.users = vec![user("u-1", &["product"]), user("u-lead", &["lead"])];
        snap.platforms = vec![
            platform("web", "Web"),
            platform("trade-server", "交易服务端"),
        ];
        snap.requirements[0].platform_ids = vec!["web".into(), "trade-server".into()];
        snap.requirements[0].design_status = DESIGN_UNCLAIMED.into();
        let product = user("u-1", &["product"]);
        let submitted = submit_requirement(
            &mut snap,
            &product,
            "S1-001",
            Some("去掉交易服务端，不做设计"),
            Vec::new(),
            Some(vec!["web".into()]),
            Some(true),
            SubmitAssignments::default(),
        )
        .unwrap();
        assert_eq!(submitted.platform_ids, vec!["web".to_string()]);
        assert_eq!(submitted.design_status, DESIGN_NONE);
        assert_eq!(submitted.status, STATUS_PENDING_REVIEW);
    }

    #[test]
    fn submit_rejects_scope_change_after_dev_assigned() {
        let mut snap = snapshot_with(STATUS_PENDING_REVIEW, &["S1-001"]);
        snap.users = vec![
            user("u-1", &["product"]),
            user("u-lead", &["lead"]),
            user("u-dev", &["dev"]),
        ];
        snap.platforms = vec![
            platform("web", "Web"),
            platform("trade-server", "交易服务端"),
        ];
        snap.requirements[0].platform_ids = vec!["web".into(), "trade-server".into()];
        snap.requirements[0].ensure_dev_tasks();
        snap.requirements[0]
            .dev_task_mut("trade-server")
            .unwrap()
            .assignee_id = Some("u-dev".into());
        let product = user("u-1", &["product"]);
        let error = submit_requirement(
            &mut snap,
            &product,
            "S1-001",
            None,
            Vec::new(),
            Some(vec!["web".into()]),
            None,
            SubmitAssignments::default(),
        )
        .unwrap_err();
        assert_eq!(error.status, axum::http::StatusCode::CONFLICT);
        assert!(error.message.contains("涉及端"));
    }
}
