use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const STATUS_DRAFT: &str = "draft";
pub const STATUS_CREATING: &str = "creating";
pub const STATUS_CREATE_FAILED: &str = "create_failed";
pub const STATUS_PENDING_REVIEW: &str = "pending_review";
pub const STATUS_CHANGES_REQUESTED: &str = "changes_requested";
pub const STATUS_APPROVED: &str = "approved";
pub const STATUS_SCHEDULED: &str = "scheduled";
pub const STATUS_BACKLOG: &str = "backlog";
pub const STATUS_IN_PROGRESS: &str = "in_progress";
pub const STATUS_DEV_DONE: &str = "dev_done";
pub const STATUS_TESTING: &str = "testing";
pub const STATUS_TEST_FAILED: &str = "test_failed";
pub const STATUS_TEST_PASSED: &str = "test_passed";
pub const STATUS_FROZEN: &str = "frozen";
pub const STATUS_RELEASED: &str = "released";
pub const STATUS_DONE: &str = "done";

pub const DESIGN_NONE: &str = "not_needed";
pub const DESIGN_UNCLAIMED: &str = "unclaimed";
pub const DESIGN_DESIGNING: &str = "designing";
pub const DESIGN_DELIVERED: &str = "delivered";
pub const DESIGN_CHANGES: &str = "changes_requested";

pub const ROLE_LEAD: &str = "lead";
pub const ROLE_PRODUCT: &str = "product";
pub const ROLE_DESIGN: &str = "design";
pub const ROLE_DEV: &str = "dev";
pub const ROLE_QA: &str = "qa";
pub const ROLE_ADMIN: &str = "admin";

pub const DEV_UNASSIGNED: &str = "unassigned";
pub const DEV_ASSIGNED: &str = "assigned";
pub const DEV_IN_PROGRESS: &str = "in_progress";
pub const DEV_DONE: &str = "done";

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub roles: Vec<String>,
    #[serde(default)]
    pub platforms: Vec<String>,
    #[serde(default)]
    pub active_platform_ids: Vec<String>,
    #[serde(default)]
    pub active_role: Option<String>,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default)]
    pub onboarding_completed_at: Option<String>,
    #[serde(default)]
    pub folder_configured: bool,
    #[serde(default)]
    pub dingtalk_user_id: Option<String>,
    #[serde(default)]
    pub dingtalk_union_id: Option<String>,
    #[serde(default)]
    pub dingtalk_open_id: Option<String>,
    #[serde(default)]
    pub mobile: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub department_ids: Vec<String>,
    #[serde(default)]
    pub current_iteration_id: Option<String>,
}

impl User {
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.iter().any(|item| item == role)
    }

    pub fn can_plan(&self) -> bool {
        self.has_role(ROLE_LEAD) || self.has_role(ROLE_ADMIN)
    }

    pub fn can_product(&self) -> bool {
        self.has_role(ROLE_PRODUCT) || self.can_plan()
    }

    /// 新建需求只属于产品；负责人负责评审、排期、指派和封板。
    pub fn can_create_requirement(&self) -> bool {
        self.has_role(ROLE_PRODUCT) || self.has_role(ROLE_ADMIN)
    }

    pub fn can_design(&self) -> bool {
        self.has_role(ROLE_DESIGN) || self.can_plan()
    }

    pub fn can_dev(&self) -> bool {
        self.has_role(ROLE_DEV) || self.can_plan()
    }

    pub fn can_test(&self) -> bool {
        self.has_role(ROLE_QA) || self.can_plan()
    }

    pub fn owns_platform(&self, platform_id: &str) -> bool {
        self.platforms.iter().any(|item| item == platform_id)
            || self.active_platform_ids.iter().any(|item| item == platform_id)
    }

    pub fn public_json(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "roles": self.roles,
            "platforms": self.platforms,
            "activeRole": self.active_role.clone().or_else(|| self.roles.first().cloned()),
            "active": self.active,
        })
    }

    pub fn private_json(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "roles": self.roles,
            "platforms": self.platforms,
            "activeRole": self.active_role.clone().or_else(|| self.roles.first().cloned()),
            "active": self.active,
            "activePlatformIds": self.active_platform_ids,
            "onboarding": {
                "completedAt": self.onboarding_completed_at,
                "folderConfigured": self.folder_configured,
            },
            "currentIterationId": self.current_iteration_id,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub order: i64,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default)]
    pub supports_api_doc: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    pub id: String,
    pub group_id: String,
    pub name: String,
    pub short_name: String,
    #[serde(default)]
    pub order: i64,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default)]
    pub owner_id: Option<String>,
    #[serde(default)]
    pub lead_ids: Vec<String>,
    #[serde(default)]
    pub gitlab_project_id: Option<String>,
    #[serde(default)]
    pub gitlab_project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Iteration {
    pub id: String,
    pub code: String,
    pub short_code: String,
    pub name: String,
    #[serde(default)]
    pub phase: String,
    #[serde(default = "default_iteration_status")]
    pub status: String,
    #[serde(default)]
    pub start_date: String,
    #[serde(default)]
    pub end_date: String,
    #[serde(default)]
    pub owner_id: Option<String>,
    #[serde(default)]
    pub reviewer_ids: Vec<String>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub created_at: String,
}

fn default_iteration_status() -> String {
    "planning".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub version: u32,
    pub summary: String,
    pub at: String,
    pub by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignVersion {
    pub version: u32,
    pub summary: String,
    pub at: String,
    pub by: String,
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub artifact_ids: Vec<String>,
}

/// 需求活文档：需求正文、验收标准与背景说明。与评审轮次解耦，修改不会改变
/// `versions`，避免文档编辑被误当成一次需求评审。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementDocument {
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub acceptance_criteria: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub updated_by: Option<String>,
    #[serde(default)]
    pub version: u32,
}

/// 附件/设计稿元数据。正文单独存放在 Snapshot 的 `artifact_contents`，避免
/// `/state` 把大文件内容反复下发。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactMeta {
    pub id: String,
    pub requirement_id: String,
    pub name: String,
    #[serde(default)]
    pub kind: String,
    pub content_type: String,
    /// 空字符串表示 utf-8 文本，`base64` 表示二进制附件。
    #[serde(default)]
    pub encoding: String,
    pub size: usize,
    pub created_at: String,
    pub created_by: String,
    #[serde(default)]
    pub design_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactContent {
    pub id: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub id: String,
    pub version: u32,
    /// approved | rejected
    pub decision: String,
    #[serde(default)]
    pub comment: String,
    pub at: String,
    pub by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeChange {
    pub at: String,
    pub by: String,
    pub in_scope: bool,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevTask {
    pub id: String,
    pub platform_id: String,
    #[serde(default)]
    pub assignee_id: Option<String>,
    /// unassigned | assigned | in_progress | done
    pub status: String,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub mr_url: Option<String>,
    #[serde(default)]
    pub pipeline_status: Option<String>,
    #[serde(default)]
    pub pipeline_url: Option<String>,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRun {
    pub id: String,
    /// running | passed | failed
    pub status: String,
    pub started_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
    pub by: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub bug_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub version: String,
    pub at: String,
    pub by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Requirement {
    pub id: String,
    pub code: String,
    pub title: String,
    pub iteration_id: String,
    pub status: String,
    pub design_status: String,
    #[serde(default)]
    pub platform_ids: Vec<String>,
    pub owner_id: String,
    #[serde(default)]
    pub designer_id: Option<String>,
    #[serde(default)]
    pub in_scope: bool,
    #[serde(default)]
    pub versions: Vec<Version>,
    #[serde(default)]
    pub design_versions: Vec<DesignVersion>,
    #[serde(default)]
    pub reviews: Vec<Review>,
    #[serde(default)]
    pub reviewer_ids: Vec<String>,
    #[serde(default)]
    pub scope_changes: Vec<ScopeChange>,
    #[serde(default)]
    pub sessions: Vec<SessionRecord>,
    #[serde(default)]
    pub primary_session_id: Option<String>,
    #[serde(default)]
    pub planned_start_date: Option<String>,
    #[serde(default)]
    pub planned_end_date: Option<String>,
    #[serde(default)]
    pub scheduled_at: Option<String>,
    #[serde(default)]
    pub scheduled_by: Option<String>,
    #[serde(default)]
    pub design_delivered_at: Option<String>,
    #[serde(default)]
    pub design_updated_at: Option<String>,
    #[serde(default)]
    pub dev_tasks: Vec<DevTask>,
    #[serde(default)]
    pub test_runs: Vec<TestRun>,
    #[serde(default)]
    pub release: Option<ReleaseInfo>,
    #[serde(default)]
    pub document: RequirementDocument,
    #[serde(default)]
    pub artifacts: Vec<ArtifactMeta>,
    #[serde(default)]
    pub create_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Requirement {
    pub fn session_record(&self, id: &str) -> Option<&SessionRecord> {
        self.sessions.iter().find(|item| item.id == id)
    }

    pub fn dev_started(&self) -> bool {
        self.dev_tasks.iter().any(|task| task.started_at.is_some())
    }

    pub fn all_dev_done(&self) -> bool {
        !self.dev_tasks.is_empty() && self.dev_tasks.iter().all(|task| task.status == DEV_DONE)
    }

    pub fn ensure_dev_tasks(&mut self) {
        for platform_id in &self.platform_ids {
            if !self.dev_tasks.iter().any(|task| &task.platform_id == platform_id) {
                self.dev_tasks.push(DevTask {
                    id: format!("dev-{}", uuid::Uuid::new_v4()),
                    platform_id: platform_id.clone(),
                    assignee_id: None,
                    status: DEV_UNASSIGNED.to_string(),
                    started_at: None,
                    finished_at: None,
                    branch: None,
                    mr_url: None,
                    pipeline_status: None,
                    pipeline_url: None,
                    note: String::new(),
                });
            }
        }
        self.dev_tasks.retain(|task| self.platform_ids.iter().any(|id| id == &task.platform_id));
    }

    pub fn dev_task_mut(&mut self, platform_id: &str) -> Option<&mut DevTask> {
        self.dev_tasks.iter_mut().find(|task| task.platform_id == platform_id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillVersion {
    pub version: u32,
    pub content: String,
    #[serde(default)]
    pub summary: String,
    pub at: String,
    pub by: String,
    /// approved | rejected | null (待审核)
    #[serde(default)]
    pub decision: Option<String>,
    #[serde(default)]
    pub comment: String,
    #[serde(default)]
    pub reviewed_by: Option<String>,
    #[serde(default)]
    pub reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub role_packs: Vec<String>,
    /// global | personal
    pub scope: String,
    /// active | pending_review | changes_requested | archived
    pub status: String,
    pub owner_id: String,
    #[serde(default)]
    pub versions: Vec<SkillVersion>,
    pub created_at: String,
    pub updated_at: String,
}

impl Skill {
    pub fn latest(&self) -> Option<&SkillVersion> {
        self.versions.last()
    }

    pub fn published(&self) -> bool {
        self.status == "active"
            && self
                .latest()
                .map(|version| version.decision.as_deref() == Some("approved"))
                .unwrap_or(false)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: i64,
    pub user_id: String,
    pub at: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub requirement_id: Option<String>,
    pub title: String,
    pub body: String,
    pub read: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: i64,
    pub at: String,
    #[serde(default)]
    pub actor_id: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub requirement_id: Option<String>,
    #[serde(default)]
    pub iteration_id: Option<String>,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventDraft {
    pub actor_id: Option<String>,
    pub kind: String,
    pub requirement_id: Option<String>,
    pub iteration_id: Option<String>,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationDraft {
    pub user_id: String,
    pub kind: String,
    pub requirement_id: Option<String>,
    pub title: String,
    pub body: String,
}
