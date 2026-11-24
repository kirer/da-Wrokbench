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

    pub fn active_iteration(&self, actor: &User) -> Option<&Iteration> {
        let selected = actor
            .current_iteration_id
            .as_deref()
            .and_then(|id| self.iteration(id));
        selected.or_else(|| self.iterations.iter().find(|item| !item.archived))
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
}

pub fn demo_seed_enabled() -> bool {
    let env = std::env::var("APP_ENV")
        .unwrap_or_else(|_| "development".to_string())
        .trim()
        .to_lowercase();
    let development = matches!(env.as_str(), "development" | "dev" | "test");
    let explicit = std::env::var("WORKBENCH_SEED_DEMO")
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_lowercase().as_str(),
                "1" | "true" | "yes"
            )
        });
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

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
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
        "#,
    )
}

pub fn seed_snapshot() -> Snapshot {
    Snapshot {
        users: seed::users(),
        groups: seed::platform_groups(),
        platforms: seed::platforms(),
        iterations: seed::iterations(),
        requirements: seed::requirements(),
        skills: seed::skills(),
        events: Vec::new(),
        notifications: Vec::new(),
        pending_events: seed::events_seed()
            .into_iter()
            .map(|(actor_id, kind, requirement_id, iteration_id, payload)| EventDraft {
                actor_id,
                kind,
                requirement_id,
                iteration_id,
                payload,
            })
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
pub fn append_pending(snapshot: &mut Snapshot) {
    let mut next_event = snapshot.events.iter().map(|item| item.id).max().unwrap_or(0) + 1;
    for draft in snapshot.pending_events.drain(..) {
        snapshot.events.push(Event {
            id: next_event,
            at: crate::now_iso(),
            actor_id: draft.actor_id,
            kind: draft.kind,
            requirement_id: draft.requirement_id,
            iteration_id: draft.iteration_id,
            payload: draft.payload,
        });
        next_event += 1;
    }
    let mut next_notification = snapshot
        .notifications
        .iter()
        .map(|item| item.id)
        .max()
        .unwrap_or(0)
        + 1;
    for draft in snapshot.pending_notifications.drain(..) {
        snapshot.notifications.push(Notification {
            id: next_notification,
            user_id: draft.user_id,
            at: crate::now_iso(),
            kind: draft.kind,
            requirement_id: draft.requirement_id,
            title: draft.title,
            body: draft.body,
            read: false,
        });
        next_notification += 1;
    }
}

fn parse<T: DeserializeOwned>(raw: String) -> rusqlite::Result<T> {
    serde_json::from_str(&raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
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

pub fn load_snapshot(conn: &Connection) -> rusqlite::Result<Snapshot> {
    Ok(Snapshot {
        users: load_rows(conn, "users")?,
        groups: load_rows(conn, "platform_groups")?,
        platforms: load_rows(conn, "platforms")?,
        iterations: load_rows(conn, "iterations")?,
        requirements: load_rows(conn, "requirements")?,
        skills: load_rows(conn, "skills")?,
        events: Vec::new(),
        notifications: Vec::new(),
        pending_events: Vec::new(),
        pending_notifications: Vec::new(),
        artifact_contents: load_rows(conn, "artifact_contents")?,
    })
}

pub fn save_snapshot(conn: &Connection, snapshot: &mut Snapshot) -> rusqlite::Result<()> {
    for user in &snapshot.users {
        let data = serde_json::to_string(user).unwrap_or_default();
        conn.execute(
            "INSERT INTO users(id, data) VALUES(?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            params![user.id, data],
        )?;
    }
    for group in &snapshot.groups {
        let data = serde_json::to_string(group).unwrap_or_default();
        conn.execute(
            "INSERT INTO platform_groups(id, data) VALUES(?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            params![group.id, data],
        )?;
    }
    for platform in &snapshot.platforms {
        let data = serde_json::to_string(platform).unwrap_or_default();
        conn.execute(
            "INSERT INTO platforms(id, data) VALUES(?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            params![platform.id, data],
        )?;
    }
    for iteration in &snapshot.iterations {
        let data = serde_json::to_string(iteration).unwrap_or_default();
        conn.execute(
            "INSERT INTO iterations(id, data) VALUES(?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            params![iteration.id, data],
        )?;
    }
    for requirement in &snapshot.requirements {
        let data = serde_json::to_string(requirement).unwrap_or_default();
        conn.execute(
            "INSERT INTO requirements(id, iteration_id, code, status, data, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               iteration_id = excluded.iteration_id,
               code = excluded.code,
               status = excluded.status,
               data = excluded.data,
               updated_at = excluded.updated_at",
            params![
                requirement.id,
                requirement.iteration_id,
                requirement.code,
                requirement.status,
                data,
                requirement.updated_at
            ],
        )?;
    }
    for skill in &snapshot.skills {
        let data = serde_json::to_string(skill).unwrap_or_default();
        conn.execute(
            "INSERT INTO skills(id, data) VALUES(?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            params![skill.id, data],
        )?;
    }
    for artifact in &snapshot.artifact_contents {
        let data = serde_json::to_string(artifact).unwrap_or_default();
        conn.execute(
            "INSERT INTO artifact_contents(id, data) VALUES(?1, ?2)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            params![artifact.id, data],
        )?;
    }
    for event in snapshot.pending_events.drain(..) {
        conn.execute(
            "INSERT INTO events(at, actor_id, type, requirement_id, iteration_id, payload)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                crate::now_iso(),
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
