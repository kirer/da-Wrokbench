use crate::models::*;
use crate::seed;
use rusqlite::{params, Connection};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Snapshot {
    pub users: Vec<User>,
    pub groups: Vec<PlatformGroup>,
    pub platforms: Vec<Platform>,
    #[serde(default)]
    pub projects: Vec<Project>,
    pub iterations: Vec<Iteration>,
    pub requirements: Vec<Requirement>,
    pub skills: Vec<Skill>,
    // Postgres 把整份状态作为一个 JSONB 快照保存；SQLite 则把事件/通知放在独立表。
    // 这两个字段只在 Postgres 后端参与持久化，SQLite 读取时为空。
    #[serde(default)]
    pub events: Vec<Event>,
    #[serde(default)]
    pub notifications: Vec<Notification>,
    #[serde(default)]
    pub pending_events: Vec<EventDraft>,
    #[serde(default)]
    pub pending_notifications: Vec<NotificationDraft>,
    /// 附件/设计稿正文。元数据在 Requirement.artifacts，这里只保存实际内容。
    #[serde(default)]
    pub artifact_contents: Vec<ArtifactContent>,
    /// 全局修订号：每次成功保存 +1，用于 /state 的 ETag/增量判断。
    #[serde(default)]
    pub revision: i64,
}

impl Snapshot {
    pub fn user(&self, id: &str) -> Option<&User> {
        self.users.iter().find(|user| user.id == id)
    }

    pub fn active_user(&self, id: &str) -> Option<&User> {
        self.users.iter().find(|user| user.id == id && user.active)
    }

    pub fn iteration(&self, id: &str) -> Option<&Iteration> {
        self.iterations.iter().find(|iteration| iteration.id == id)
    }

    pub fn project(&self, id: &str) -> Option<&Project> {
        self.projects.iter().find(|project| project.id == id)
    }

    pub fn active_project(&self, actor: &User) -> Option<&Project> {
        let selected = actor
            .current_project_id
            .as_deref()
            .and_then(|id| self.project(id))
            .filter(|project| !project.archived);
        // 只会落到未归档的项目上；全部归档时就是没有当前项目。
        selected.or_else(|| self.projects.iter().find(|project| !project.archived))
    }

    pub fn active_iteration(&self, actor: &User) -> Option<&Iteration> {
        let project = self.active_project(actor);
        let in_project = |iteration: &&Iteration| {
            if iteration.archived {
                return false;
            }
            match project {
                Some(project) => iteration.project_id.as_deref() == Some(project.id.as_str()),
                None => true,
            }
        };
        let selected = actor
            .current_iteration_id
            .as_deref()
            .and_then(|id| self.iteration(id))
            .filter(|iteration| in_project(iteration));
        // 只在当前项目里兜底：项目还没有迭代时就是没有当前迭代，不能落到别的项目去。
        selected.or_else(|| {
            self.iterations
                .iter()
                .filter(in_project)
                .max_by(|left, right| left.code.cmp(&right.code))
        })
    }

    /// 老数据库没有 projects 表数据：内存里补一个默认项目，把没有归属的迭代挂上去。
    /// 下一次 save_snapshot 会把这个归属写回数据库。
    /// 项目和迭代都被主动清空时保持为空，不自动塞回默认项目；只清掉用户指向已删除项目的选择。
    pub fn ensure_projects(&mut self) {
        if self.projects.is_empty() && self.iterations.is_empty() && self.requirements.is_empty() {
            for user in &mut self.users {
                user.current_project_id = None;
            }
            return;
        }
        if self.projects.is_empty() {
            self.projects.push(seed::default_project());
        }
        let ids: Vec<String> = self
            .projects
            .iter()
            .map(|project| project.id.clone())
            .collect();
        // 兜底项目只认未归档的；上面已经保证至少有一个项目。
        let fallback = self
            .projects
            .iter()
            .find(|project| !project.archived)
            .unwrap_or(&self.projects[0])
            .id
            .clone();
        for iteration in &mut self.iterations {
            let known = iteration
                .project_id
                .as_deref()
                .map(|id| ids.iter().any(|known| known == id))
                .unwrap_or(false);
            if !known {
                iteration.project_id = Some(fallback.clone());
            }
        }
        for user in &mut self.users {
            let known = user
                .current_project_id
                .as_deref()
                .map(|id| ids.iter().any(|known| known == id))
                .unwrap_or(false);
            if !known {
                user.current_project_id = Some(fallback.clone());
            }
        }
    }

    pub fn requirement_index(&self, reference: &str) -> Option<usize> {
        let reference = reference.trim();
        if reference.is_empty() {
            return None;
        }
        self.requirements.iter().position(|requirement| {
            requirement.id == reference
                || requirement.code.eq_ignore_ascii_case(reference)
                || requirement
                    .sessions
                    .iter()
                    .any(|session| session.id == reference)
                || requirement.primary_session_id.as_deref() == Some(reference)
        })
    }

    pub fn push_event(
        &mut self,
        actor_id: Option<&str>,
        kind: &str,
        requirement_id: Option<&str>,
        iteration_id: Option<&str>,
        payload: Value,
    ) {
        self.pending_events.push(EventDraft {
            actor_id: actor_id.map(String::from),
            kind: kind.to_string(),
            requirement_id: requirement_id.map(String::from),
            iteration_id: iteration_id.map(String::from),
            payload,
        });
    }

    pub fn notify(
        &mut self,
        user_id: &str,
        kind: &str,
        requirement_id: Option<&str>,
        title: &str,
        body: &str,
    ) {
        if user_id.is_empty() {
            return;
        }
        // 同一操作里同一人可能既是负责人又是迭代负责人/评审人；同样的未读提醒只留一条。
        if self.pending_notifications.iter().any(|item| {
            item.user_id == user_id
                && item.kind == kind
                && item.requirement_id.as_deref() == requirement_id
                && item.title == title
                && item.body == body
        }) {
            return;
        }
        let dingtalk_user_id = self
            .user(user_id)
            .and_then(|user| user.dingtalk_user_id.clone());
        self.pending_notifications.push(NotificationDraft {
            user_id: user_id.to_string(),
            kind: kind.to_string(),
            requirement_id: requirement_id.map(String::from),
            title: title.to_string(),
            body: body.to_string(),
        });
        if let Some(userid) = dingtalk_user_id {
            crate::dingtalk::enqueue(crate::dingtalk::WorkNotice {
                userid,
                title: title.to_string(),
                body: body.to_string(),
            });
        }
    }

    /// 用户完成与某需求相关的动作后，把该需求发给他的未读提醒标记为已读，
    /// 避免通知中心积压过期待办；还没落库的待发提醒也一并撤掉。
    pub fn mark_requirement_notifications_read(&mut self, user_id: &str, requirement_id: &str) {
        for item in self.notifications.iter_mut() {
            if item.user_id == user_id
                && item.requirement_id.as_deref() == Some(requirement_id)
                && !item.read
            {
                item.read = true;
            }
        }
        self.pending_notifications.retain(|item| {
            !(item.user_id == user_id && item.requirement_id.as_deref() == Some(requirement_id))
        });
    }
}

pub fn demo_seed_enabled() -> bool {
    let env = std::env::var("APP_ENV")
        .unwrap_or_else(|_| "development".to_string())
        .trim()
        .to_lowercase();
    let development = matches!(env.as_str(), "development" | "dev" | "test");
    let explicit = std::env::var("WORKBENCH_SEED_DEMO")
        .ok()
        .map(|value| matches!(value.trim().to_lowercase().as_str(), "1" | "true" | "yes"));
    explicit.unwrap_or(development)
}

pub fn open(path: &str) -> rusqlite::Result<Connection> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700));
            }
        }
    }
    let conn = Connection::open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    init_schema(&conn)?;
    seed_if_empty(&conn)?;
    Ok(conn)
}

pub(crate) fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS platform_groups (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS platforms (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS iterations (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS requirements (
            id TEXT PRIMARY KEY,
            iteration_id TEXT NOT NULL,
            code TEXT NOT NULL,
            status TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_requirements_iteration ON requirements(iteration_id);
        CREATE INDEX IF NOT EXISTS idx_requirements_code ON requirements(code);
        CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL,
            actor_id TEXT,
            type TEXT NOT NULL,
            requirement_id TEXT,
            iteration_id TEXT,
            payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_events_requirement ON events(requirement_id);
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            at TEXT NOT NULL,
            type TEXT NOT NULL,
            requirement_id TEXT,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            read INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
        CREATE TABLE IF NOT EXISTS artifact_contents (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
            delivery TEXT PRIMARY KEY,
            seen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS revoked_tokens (
            jti TEXT PRIMARY KEY,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workbench_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;
    // 老库补 hash 列（用于跳过未变更需求的整行重写）；已存在时忽略报错。
    let _ = conn.execute("ALTER TABLE requirements ADD COLUMN hash TEXT", []);
    for table in [
        "users",
        "platform_groups",
        "platforms",
        "projects",
        "iterations",
        "skills",
    ] {
        let _ = conn.execute(&format!("ALTER TABLE {table} ADD COLUMN hash TEXT"), []);
    }
    // 需求编号唯一约束：拆表/并发创建后由数据库兜底，避免生成重复编号。
    // 老库可能已有历史重复编号，建索引失败时只告警、不阻断启动。
    if let Err(error) = conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_requirements_code ON requirements(code)",
        [],
    ) {
        tracing::warn!("建立需求编号唯一索引失败（可能存在历史重复编号）：{error}");
    }
    Ok(())
}

pub fn seed_snapshot() -> Snapshot {
    Snapshot {
        users: seed::users(),
        groups: seed::platform_groups(),
        platforms: seed::platforms(),
        projects: seed::projects(),
        iterations: seed::iterations(),
        requirements: seed::requirements(),
        skills: seed::skills(),
        events: Vec::new(),
        notifications: Vec::new(),
        pending_events: seed::events_seed()
            .into_iter()
            .map(
                |(actor_id, kind, requirement_id, iteration_id, payload)| EventDraft {
                    actor_id,
                    kind,
                    requirement_id,
                    iteration_id,
                    payload,
                },
            )
            .collect(),
        pending_notifications: seed::notifications()
            .into_iter()
            .map(
                |(user_id, _at, kind, requirement_id, title, body, _read)| NotificationDraft {
                    user_id,
                    kind,
                    requirement_id,
                    title,
                    body,
                },
            )
            .collect(),
        artifact_contents: Vec::new(),
        revision: 0,
    }
}

fn seed_if_empty(conn: &Connection) -> rusqlite::Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }
    if !demo_seed_enabled() {
        tracing::warn!(
            "空数据库且未启用演示数据；生产环境请先导入管理员账号（仅演示可设置 WORKBENCH_SEED_DEMO=1）"
        );
        return Ok(());
    }
    let mut snapshot = seed_snapshot();
    // 种子事件的 at 使用插入时间；演示数据保留固定标题与内容即可。
    save_snapshot(conn, &mut snapshot)
}

// Postgres 使用单个 JSONB 快照；把本轮变更追加到历史数组并分配自增 id。
#[allow(dead_code)]
pub fn append_pending(snapshot: &mut Snapshot) {
    let first_event_id = snapshot
        .events
        .iter()
        .map(|item| item.id)
        .max()
        .unwrap_or(0)
        + 1;
    for (offset, draft) in snapshot.pending_events.drain(..).enumerate() {
        snapshot.events.push(Event {
            id: first_event_id + offset as i64,
            at: crate::now_iso(),
            actor_id: draft.actor_id,
            kind: draft.kind,
            requirement_id: draft.requirement_id,
            iteration_id: draft.iteration_id,
            payload: draft.payload,
        });
    }
    let first_notification_id = snapshot
        .notifications
        .iter()
        .map(|item| item.id)
        .max()
        .unwrap_or(0)
        + 1;
    for (offset, draft) in snapshot.pending_notifications.drain(..).enumerate() {
        snapshot.notifications.push(Notification {
            id: first_notification_id + offset as i64,
            user_id: draft.user_id,
            at: crate::now_iso(),
            kind: draft.kind,
            requirement_id: draft.requirement_id,
            title: draft.title,
            body: draft.body,
            read: false,
        });
    }
    // Postgres 把整份状态存成一个 JSONB：数组只增不减会让每次读写越来越重。
    // 上限和 SQLite 表的裁剪保持一致（见 prune_append_only_tables）。
    if snapshot.events.len() > 20_000 {
        let excess = snapshot.events.len() - 20_000;
        snapshot.events.drain(..excess);
    }
    let mut read_per_user: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    let mut remove = std::collections::HashSet::new();
    for notification in snapshot.notifications.iter().rev() {
        if !notification.read {
            continue;
        }
        let count = read_per_user
            .entry(notification.user_id.clone())
            .or_insert(0);
        *count += 1;
        if *count > 500 {
            remove.insert(notification.id);
        }
    }
    if !remove.is_empty() {
        snapshot
            .notifications
            .retain(|item| !remove.contains(&item.id));
    }
}

fn parse<T: DeserializeOwned>(raw: String) -> rusqlite::Result<T> {
    serde_json::from_str(&raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
    })
}

// 附件正文可外置到本地对象目录（WORKBENCH_BLOB_DIR）：数据库只存元数据，
// 正文落到文件，避免大附件把库撑大。默认关闭（未配置）时行为完全不变。
pub(crate) fn blob_dir() -> Option<std::path::PathBuf> {
    std::env::var("WORKBENCH_BLOB_DIR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
}

pub(crate) fn blob_safe_name(id: &str) -> String {
    id.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn load_artifacts(
    conn: &Connection,
    blob: Option<&Path>,
) -> rusqlite::Result<Vec<ArtifactContent>> {
    let mut statement = conn.prepare("SELECT id, data FROM artifact_contents")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, data) = row?;
        if let Some(dir) = blob {
            if let Ok(marker) = serde_json::from_str::<Value>(&data) {
                if let Some(name) = marker.get("blob").and_then(Value::as_str) {
                    let path = dir.join(name);
                    let content = std::fs::read_to_string(&path).unwrap_or_default();
                    out.push(ArtifactContent { id, content });
                    continue;
                }
            }
        }
        out.push(parse::<ArtifactContent>(data)?);
    }
    Ok(out)
}

pub(crate) fn hash_str(value: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// 按内容哈希增量 upsert 一张 (id,data,hash) 表：未变化的行整体跳过，减少写放大。
fn save_hashed<T: serde::Serialize>(
    conn: &Connection,
    table: &str,
    items: &[T],
    id_of: impl Fn(&T) -> &str,
) -> rusqlite::Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    let existing: std::collections::HashMap<String, String> = {
        let mut map = std::collections::HashMap::new();
        let mut statement = conn.prepare(&format!("SELECT id, hash FROM {table}"))?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (id, hash) = row?;
            if let Some(hash) = hash {
                map.insert(id, hash);
            }
        }
        map
    };
    let sql = format!(
        "INSERT INTO {table}(id, data, hash) VALUES(?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = excluded.data, hash = excluded.hash"
    );
    for item in items {
        let data = serde_json::to_string(item).unwrap_or_default();
        let hash = hash_str(&data);
        let id = id_of(item);
        if existing
            .get(id)
            .map(|stored| stored == &hash)
            .unwrap_or(false)
        {
            continue;
        }
        conn.execute(&sql, params![id, data, hash])?;
    }
    Ok(())
}

fn load_rows<T: DeserializeOwned>(conn: &Connection, table: &str) -> rusqlite::Result<Vec<T>> {
    let mut statement = conn.prepare(&format!("SELECT data FROM {table}"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(parse::<T>(row?)?);
    }
    Ok(out)
}

/// 只读接口用：不加载附件正文。正文可能很大，/state 每次轮询都读一遍纯属浪费。
/// 写路径必须用 [`load_snapshot`]：保存时按快照做差集，缺了正文会把附件行删掉。
pub fn load_snapshot_without_contents(conn: &Connection) -> rusqlite::Result<Snapshot> {
    let mut snapshot = load_snapshot_inner(conn, false, blob_dir().as_deref())?;
    snapshot.ensure_projects();
    Ok(snapshot)
}

pub fn load_snapshot(conn: &Connection) -> rusqlite::Result<Snapshot> {
    let mut snapshot = load_snapshot_inner(conn, true, blob_dir().as_deref())?;
    snapshot.ensure_projects();
    Ok(snapshot)
}

fn load_snapshot_inner(
    conn: &Connection,
    with_contents: bool,
    blob: Option<&Path>,
) -> rusqlite::Result<Snapshot> {
    let mut snapshot = Snapshot {
        users: load_rows(conn, "users")?,
        groups: load_rows(conn, "platform_groups")?,
        platforms: load_rows(conn, "platforms")?,
        projects: load_rows(conn, "projects")?,
        iterations: load_rows(conn, "iterations")?,
        requirements: load_rows(conn, "requirements")?,
        skills: load_rows(conn, "skills")?,
        events: Vec::new(),
        notifications: Vec::new(),
        pending_events: Vec::new(),
        pending_notifications: Vec::new(),
        artifact_contents: if with_contents {
            load_artifacts(conn, blob)?
        } else {
            Vec::new()
        },
        revision: 0,
    };
    snapshot.revision = conn
        .query_row(
            "SELECT value FROM workbench_meta WHERE key = 'revision'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    Ok(snapshot)
}

/// 按 id 读取单个附件正文，配合 [`load_snapshot_without_contents`] 使用。
pub fn artifact_content(conn: &Connection, id: &str) -> rusqlite::Result<Option<String>> {
    use rusqlite::OptionalExtension;
    let raw: Option<String> = conn
        .query_row(
            "SELECT data FROM artifact_contents WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(raw.and_then(|data| {
        if let Some(dir) = blob_dir() {
            if let Ok(marker) = serde_json::from_str::<Value>(&data) {
                if let Some(name) = marker.get("blob").and_then(Value::as_str) {
                    return std::fs::read_to_string(dir.join(name)).ok();
                }
            }
        }
        serde_json::from_str::<ArtifactContent>(&data)
            .ok()
            .map(|content| content.content)
    }))
}

// SQLite 后端按快照重建数据，但增量保存不会自动删除已经不在快照里的行。
// 需求删除后要把需求行、通知和附件正文一起删掉，否则重启后会被重新加载回来。
fn delete_removed_requirements(
    conn: &Connection,
    snapshot: &Snapshot,
    blob: Option<&Path>,
) -> rusqlite::Result<()> {
    let keep: std::collections::HashSet<&str> = snapshot
        .requirements
        .iter()
        .map(|requirement| requirement.id.as_str())
        .collect();
    let ids: Vec<String> = {
        let mut statement = conn.prepare("SELECT id FROM requirements")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        out
    };
    use rusqlite::OptionalExtension;
    for id in ids {
        if keep.contains(id.as_str()) {
            continue;
        }
        // 只有被删除的需求才读整行数据（用来清附件），避免每次保存都全量读需求正文。
        let data: Option<String> = conn
            .query_row(
                "SELECT data FROM requirements WHERE id = ?1",
                params![&id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(data) = data {
            if let Ok(requirement) = serde_json::from_str::<Requirement>(&data) {
                for artifact in &requirement.artifacts {
                    conn.execute(
                        "DELETE FROM artifact_contents WHERE id = ?1",
                        params![&artifact.id],
                    )?;
                    if let Some(dir) = blob {
                        let _ = std::fs::remove_file(dir.join(blob_safe_name(&artifact.id)));
                    }
                }
            }
        }
        conn.execute("DELETE FROM requirements WHERE id = ?1", params![&id])?;
        conn.execute(
            "DELETE FROM notifications WHERE requirement_id = ?1",
            params![&id],
        )?;
    }
    Ok(())
}

pub fn save_snapshot(conn: &Connection, snapshot: &mut Snapshot) -> rusqlite::Result<()> {
    save_snapshot_with_blob(conn, snapshot, blob_dir().as_deref())
}

fn save_snapshot_with_blob(
    conn: &Connection,
    snapshot: &mut Snapshot,
    blob: Option<&Path>,
) -> rusqlite::Result<()> {
    delete_removed_requirements(conn, snapshot, blob)?;
    // 每次成功保存全局修订号 +1，/state 用它做 ETag 判断内容是否变化。
    snapshot.revision += 1;
    save_hashed(conn, "users", &snapshot.users, |item| item.id.as_str())?;
    save_hashed(conn, "platform_groups", &snapshot.groups, |item| {
        item.id.as_str()
    })?;
    save_hashed(conn, "platforms", &snapshot.platforms, |item| {
        item.id.as_str()
    })?;
    save_hashed(conn, "projects", &snapshot.projects, |item| {
        item.id.as_str()
    })?;
    save_hashed(conn, "iterations", &snapshot.iterations, |item| {
        item.id.as_str()
    })?;
    // 只重写内容真正变化的需求：大部分变更只动一条需求，逐条 upsert 全部需求
    // 会把整表写放大。用 data 的哈希和库里已存的 hash 比对，未变就跳过。
    let existing_hashes: std::collections::HashMap<String, String> = {
        let mut map = std::collections::HashMap::new();
        let mut statement = conn.prepare("SELECT id, hash FROM requirements")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (id, hash) = row?;
            if let Some(hash) = hash {
                map.insert(id, hash);
            }
        }
        map
    };
    for requirement in &snapshot.requirements {
        let data = serde_json::to_string(requirement).unwrap_or_default();
        let data_hash = hash_str(&data);
        if existing_hashes
            .get(&requirement.id)
            .map(|stored| stored == &data_hash)
            .unwrap_or(false)
        {
            continue;
        }
        conn.execute(
            "INSERT INTO requirements(id, iteration_id, code, status, data, updated_at, hash)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
               iteration_id = excluded.iteration_id,
               code = excluded.code,
               status = excluded.status,
               data = excluded.data,
               updated_at = excluded.updated_at,
               hash = excluded.hash",
            params![
                requirement.id,
                requirement.iteration_id,
                requirement.code,
                requirement.status,
                data,
                requirement.updated_at,
                data_hash
            ],
        )?;
    }
    save_hashed(conn, "skills", &snapshot.skills, |item| item.id.as_str())?;
    // 按 artifact_contents 的当前快照做差集同步：
    // 1. 删除已被单独 delete_artifact 移出快照的正文行，避免重启复活或膨胀；
    // 2. 跳过库里已存在的 UUID 行（附件正文创建后不可变），避免每次普通保存全量重写大文件。
    let keep_artifacts: std::collections::HashSet<&str> = snapshot
        .artifact_contents
        .iter()
        .map(|artifact| artifact.id.as_str())
        .collect();
    let mut existing_artifacts = std::collections::HashSet::new();
    {
        let mut statement = conn.prepare("SELECT id FROM artifact_contents")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            existing_artifacts.insert(row?);
        }
    }
    for existing_id in &existing_artifacts {
        if !keep_artifacts.contains(existing_id.as_str()) {
            conn.execute(
                "DELETE FROM artifact_contents WHERE id = ?1",
                params![existing_id],
            )?;
            if let Some(dir) = blob {
                let _ = std::fs::remove_file(dir.join(blob_safe_name(existing_id)));
            }
        }
    }
    for artifact in &snapshot.artifact_contents {
        if existing_artifacts.contains(&artifact.id) {
            continue;
        }
        let data = match blob {
            Some(dir) => {
                let name = blob_safe_name(&artifact.id);
                std::fs::create_dir_all(dir).map_err(|error| {
                    rusqlite::Error::InvalidParameterName(format!("创建对象目录失败：{error}"))
                })?;
                std::fs::write(dir.join(&name), artifact.content.as_bytes()).map_err(|error| {
                    rusqlite::Error::InvalidParameterName(format!("写对象文件失败：{error}"))
                })?;
                serde_json::json!({ "blob": name }).to_string()
            }
            None => serde_json::to_string(artifact).unwrap_or_default(),
        };
        conn.execute(
            "INSERT INTO artifact_contents(id, data) VALUES(?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            params![artifact.id, data],
        )?;
    }
    for event in snapshot.pending_events.drain(..) {
        let now = crate::now_iso();
        if event.kind.starts_with("integration.gitlab") {
            if let Some(delivery) = event
                .payload
                .get("delivery")
                .and_then(|value| value.as_str())
                .filter(|value| !value.is_empty())
            {
                conn.execute(
                    "INSERT OR IGNORE INTO webhook_deliveries(delivery, seen_at) VALUES(?1, ?2)",
                    params![delivery, &now],
                )?;
            }
        }
        conn.execute(
            "INSERT INTO events(at, actor_id, type, requirement_id, iteration_id, payload)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                now,
                event.actor_id,
                event.kind,
                event.requirement_id,
                event.iteration_id,
                event.payload.to_string()
            ],
        )?;
    }
    for notification in snapshot.pending_notifications.drain(..) {
        conn.execute(
            "INSERT INTO notifications(user_id, at, type, requirement_id, title, body, read)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, 0)",
            params![
                notification.user_id,
                crate::now_iso(),
                notification.kind,
                notification.requirement_id,
                notification.title,
                notification.body
            ],
        )?;
    }
    conn.execute(
        "INSERT INTO workbench_meta(key, value) VALUES('revision', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![snapshot.revision.to_string()],
    )?;
    prune_append_only_tables(conn)?;
    Ok(())
}

/// 追加型表只增不减，跑久了会一直变大。按行数上限删最老的：
/// 通知每人 500 条、事件（含审计）20000 条、Webhook 投递记录 20000 条。
/// 未读通知不删，避免把还没看到的提醒清掉。
fn prune_append_only_tables(conn: &Connection) -> rusqlite::Result<()> {
    // 只在确实有超量行时才执行删除：平时是一次带索引的 COUNT，不做写操作。
    let overflow: i64 = conn.query_row(
        "SELECT COUNT(*) FROM (
             SELECT user_id FROM notifications WHERE read = 1
             GROUP BY user_id HAVING COUNT(*) > 500
         )",
        [],
        |row| row.get(0),
    )?;
    if overflow > 0 {
        conn.execute(
            "DELETE FROM notifications WHERE read = 1 AND id IN (
                 SELECT id FROM (
                     SELECT id, ROW_NUMBER() OVER (
                         PARTITION BY user_id ORDER BY id DESC
                     ) AS position
                     FROM notifications WHERE read = 1
                 ) WHERE position > 500
             )",
            [],
        )?;
    }
    conn.execute(
        "DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - 20000",
        [],
    )?;
    conn.execute(
        "DELETE FROM webhook_deliveries WHERE rowid <= (SELECT MAX(rowid) FROM webhook_deliveries) - 20000",
        [],
    )?;
    Ok(())
}

pub fn find_user(conn: &Connection, id: &str) -> rusqlite::Result<Option<User>> {
    use rusqlite::OptionalExtension;
    let raw: Option<String> = conn
        .query_row("SELECT data FROM users WHERE id = ?1", params![id], |row| {
            row.get(0)
        })
        .optional()?;
    Ok(raw.and_then(|json| serde_json::from_str::<User>(&json).ok()))
}

pub fn has_webhook_delivery(conn: &Connection, delivery: &str) -> rusqlite::Result<bool> {
    if delivery.is_empty() {
        return Ok(false);
    }
    let exists: i64 = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM webhook_deliveries WHERE delivery = ?1)",
        params![delivery],
        |row| row.get(0),
    )?;
    Ok(exists != 0)
}

/// 启动时把已吊销的 token 读进内存，重启后旧 token 不会复活。
pub fn load_revoked(conn: &Connection) -> rusqlite::Result<Vec<(String, i64)>> {
    let mut statement = conn.prepare("SELECT jti, expires_at FROM revoked_tokens")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// 吊销一个 token 并落库（同时清理已过期的行）。
pub fn insert_revoked(conn: &Connection, jti: &str, expires_at: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO revoked_tokens(jti, expires_at) VALUES(?1, ?2)",
        params![jti, expires_at],
    )?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    conn.execute(
        "DELETE FROM revoked_tokens WHERE expires_at <= ?1",
        params![now],
    )?;
    Ok(())
}

pub fn notifications_for(
    conn: &Connection,
    user_id: &str,
    limit: usize,
) -> rusqlite::Result<Vec<Notification>> {
    let mut statement = conn.prepare(
        "SELECT id, user_id, at, type, requirement_id, title, body, read
         FROM notifications WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2",
    )?;
    let rows = statement.query_map(params![user_id, limit as i64], |row| {
        Ok(Notification {
            id: row.get(0)?,
            user_id: row.get(1)?,
            at: row.get(2)?,
            kind: row.get(3)?,
            requirement_id: row.get(4)?,
            title: row.get(5)?,
            body: row.get(6)?,
            read: row.get::<_, i64>(7)? != 0,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn unread_notifications(conn: &Connection, user_id: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND read = 0",
        params![user_id],
        |row| row.get(0),
    )
}

pub fn mark_notifications_read(
    conn: &Connection,
    user_id: &str,
    ids: Option<&[i64]>,
) -> rusqlite::Result<()> {
    match ids {
        None => {
            conn.execute(
                "UPDATE notifications SET read = 1 WHERE user_id = ?1",
                params![user_id],
            )?;
        }
        Some(ids) => {
            for id in ids {
                conn.execute(
                    "UPDATE notifications SET read = 1 WHERE user_id = ?1 AND id = ?2",
                    params![user_id, id],
                )?;
            }
        }
    }
    Ok(())
}

pub fn events_since(conn: &Connection, since: i64, limit: usize) -> rusqlite::Result<Vec<Event>> {
    let mut statement = conn.prepare(
        "SELECT id, at, actor_id, type, requirement_id, iteration_id, payload
         FROM events WHERE id > ?1 ORDER BY id ASC LIMIT ?2",
    )?;
    let rows = statement.query_map(params![since, limit as i64], |row| {
        let payload: String = row.get(6)?;
        Ok(Event {
            id: row.get(0)?,
            at: row.get(1)?,
            actor_id: row.get(2)?,
            kind: row.get(3)?,
            requirement_id: row.get(4)?,
            iteration_id: row.get(5)?,
            payload: serde_json::from_str(&payload).unwrap_or(Value::Null),
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[cfg(test)]
mod blob_tests {
    use super::*;

    #[test]
    fn blob_store_roundtrips_artifact_content() {
        let dir = std::env::temp_dir().join(format!("wb-blob-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let mut snap = seed_snapshot();
        snap.artifact_contents.push(ArtifactContent {
            id: "art-x".to_string(),
            content: "hello-blob".to_string(),
        });
        save_snapshot_with_blob(&conn, &mut snap, Some(&dir)).unwrap();
        // 数据库里不应再存正文，只存 blob 引用。
        let raw: String = conn
            .query_row(
                "SELECT data FROM artifact_contents WHERE id = 'art-x'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!raw.contains("hello-blob"), "正文不应写进数据库: {raw}");
        assert!(raw.contains("blob"), "应写入 blob 引用: {raw}");
        // 从文件读回正文。
        let loaded = load_snapshot_inner(&conn, true, Some(&dir)).unwrap();
        let content = loaded
            .artifact_contents
            .iter()
            .find(|item| item.id == "art-x")
            .unwrap()
            .content
            .clone();
        assert_eq!(content, "hello-blob");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn requirements_keep_hash_and_incremental_resave_works() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let mut snap = seed_snapshot();
        save_snapshot_with_blob(&conn, &mut snap, None).unwrap();
        let digest: Option<String> = conn
            .query_row("SELECT hash FROM requirements LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(digest.is_some(), "需求行应写入内容哈希");
        // 无变化再存一次不应报错（会走哈希跳过）。
        save_snapshot_with_blob(&conn, &mut snap, None).unwrap();
        // 读回仍正常。
        let loaded = load_snapshot(&conn).unwrap();
        assert_eq!(loaded.requirements.len(), snap.requirements.len());
    }
}
