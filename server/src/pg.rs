//! Postgres persistence（规范化表版）。
//!
//! 从「整份状态塞一行 JSONB + FOR UPDATE 锁全库」改为按实体拆表：users / platforms /
//! projects / iterations / requirements / skills / events / notifications / artifact_contents…
//! 读路径直接查表；写路径仍在事务里「读全量→执行领域动作→按差异落库」，但只真正写变化
//! 的行（requirements 用内容哈希跳过未变的），并用事务级 advisory lock 串行化写入，
//! 不再对整库行加锁。事件/通知走独立自增表，和 SQLite 后端语义一致。

use crate::db::{self, Snapshot};
use crate::domain::ApiError;
use crate::models::*;
use axum::http::StatusCode;
use deadpool_postgres::{Manager, ManagerConfig, RecyclingMethod, Runtime};
use serde::de::DeserializeOwned;
use serde_json::Value;
use tokio_postgres::NoTls;

pub use deadpool_postgres::Pool;

fn internal(message: impl Into<String>) -> ApiError {
    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, message)
}

fn parse_rows<T: DeserializeOwned>(rows: &[tokio_postgres::Row]) -> Result<Vec<T>, ApiError> {
    let mut out = Vec::new();
    for row in rows {
        let value: Value = row.get(0);
        out.push(
            serde_json::from_value(value)
                .map_err(|error| internal(format!("解析行数据失败：{error}")))?,
        );
    }
    Ok(out)
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS platform_groups (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS platforms (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS iterations (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY,
    iteration_id TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TEXT NOT NULL,
    hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_pg_requirements_iteration ON requirements(iteration_id);
CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    at TEXT NOT NULL,
    actor_id TEXT,
    type TEXT NOT NULL,
    requirement_id TEXT,
    iteration_id TEXT,
    payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pg_events_requirement ON events(requirement_id);
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    at TEXT NOT NULL,
    type TEXT NOT NULL,
    requirement_id TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_pg_notifications_user ON notifications(user_id, read);
CREATE TABLE IF NOT EXISTS artifact_contents (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_deliveries (delivery TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS revoked_tokens (jti TEXT PRIMARY KEY, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS workbench_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"#;

pub fn open(database_url: &str) -> Result<Pool, String> {
    let config = database_url
        .parse()
        .map_err(|error| format!("Postgres 连接串无效：{error}"))?;
    let manager = Manager::from_config(
        config,
        NoTls,
        ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        },
    );
    Pool::builder(manager)
        .max_size(16)
        .runtime(Runtime::Tokio1)
        .build()
        .map_err(|error| format!("创建 Postgres 连接池失败：{error}"))
}

pub async fn init(pool: &Pool) -> Result<(), String> {
    let client = pool
        .get()
        .await
        .map_err(|error| format!("获取 Postgres 连接失败：{error}"))?;
    client
        .batch_execute(SCHEMA)
        .await
        .map_err(|error| format!("初始化 Postgres 表失败：{error}"))?;
    migrate_legacy(&client)
        .await
        .map_err(|error| error.message)?;
    ensure_seeded(&client)
        .await
        .map_err(|error| error.message)?;
    Ok(())
}

async fn users_empty(client: &deadpool_postgres::Client) -> Result<bool, ApiError> {
    let row = client
        .query_one("SELECT COUNT(*) FROM users", &[])
        .await
        .map_err(|error| internal(format!("读取用户数失败：{error}")))?;
    let count: i64 = row.get(0);
    Ok(count == 0)
}

/// 把旧的单行 JSONB（workbench_state）导入规范化表，导入后不再使用旧表。
async fn migrate_legacy(client: &deadpool_postgres::Client) -> Result<(), ApiError> {
    if !users_empty(client).await? {
        return Ok(());
    }
    let exists = client
        .query_opt("SELECT to_regclass('public.workbench_state')::text", &[])
        .await
        .map_err(|error| internal(format!("检查旧表失败：{error}")))?;
    let table: Option<String> = exists.and_then(|row| row.get(0));
    if table.is_none() {
        return Ok(());
    }
    let row = client
        .query_opt("SELECT data FROM workbench_state WHERE id = 1", &[])
        .await
        .map_err(|error| internal(format!("读取旧状态失败：{error}")))?;
    let Some(row) = row else { return Ok(()) };
    let data: Value = row.get(0);
    let mut snapshot: Snapshot = serde_json::from_value(data)
        .map_err(|error| internal(format!("解析旧状态失败：{error}")))?;
    snapshot.ensure_projects();
    snapshot.revision = 0;
    persist(client, &mut snapshot).await?;
    tracing::info!("已把旧的单行 JSONB 状态迁移到规范化表");
    Ok(())
}

async fn ensure_seeded(client: &deadpool_postgres::Client) -> Result<(), ApiError> {
    if !users_empty(client).await? {
        return Ok(());
    }
    if !db::demo_seed_enabled() {
        tracing::warn!(
            "空数据库且未启用演示数据；生产环境请先导入管理员账号（仅演示可设置 WORKBENCH_SEED_DEMO=1）"
        );
        return Ok(());
    }
    let mut snapshot = db::seed_snapshot();
    persist(client, &mut snapshot).await?;
    Ok(())
}

pub async fn ping(pool: &Pool) -> Result<(), ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    client
        .query_one("SELECT 1", &[])
        .await
        .map_err(|error| internal(format!("Postgres 健康检查失败：{error}")))?;
    Ok(())
}

async fn load_with_client(
    client: &deadpool_postgres::Client,
    with_contents: bool,
) -> Result<(i64, Snapshot), ApiError> {
    let mut snapshot = Snapshot {
        users: parse_rows(
            &client
                .query("SELECT data FROM users", &[])
                .await
                .map_err(read_err)?,
        )?,
        groups: parse_rows(
            &client
                .query("SELECT data FROM platform_groups", &[])
                .await
                .map_err(read_err)?,
        )?,
        platforms: parse_rows(
            &client
                .query("SELECT data FROM platforms", &[])
                .await
                .map_err(read_err)?,
        )?,
        projects: parse_rows(
            &client
                .query("SELECT data FROM projects", &[])
                .await
                .map_err(read_err)?,
        )?,
        iterations: parse_rows(
            &client
                .query("SELECT data FROM iterations", &[])
                .await
                .map_err(read_err)?,
        )?,
        requirements: parse_rows(
            &client
                .query("SELECT data FROM requirements", &[])
                .await
                .map_err(read_err)?,
        )?,
        skills: parse_rows(
            &client
                .query("SELECT data FROM skills", &[])
                .await
                .map_err(read_err)?,
        )?,
        artifact_contents: if with_contents {
            load_artifacts_pg(client).await?
        } else {
            Vec::new()
        },
        ..Default::default()
    };
    snapshot.ensure_projects();
    let revision: i64 = client
        .query_opt(
            "SELECT value FROM workbench_meta WHERE key = 'revision'",
            &[],
        )
        .await
        .map_err(read_err)?
        .and_then(|row| row.get::<_, String>(0).parse::<i64>().ok())
        .unwrap_or(0);
    snapshot.revision = revision;
    Ok((revision, snapshot))
}

fn read_err(error: tokio_postgres::Error) -> ApiError {
    internal(format!("读取 Postgres 状态失败：{error}"))
}

async fn load_artifacts_pg(
    client: &deadpool_postgres::Client,
) -> Result<Vec<ArtifactContent>, ApiError> {
    let blob = db::blob_dir();
    let mut out = Vec::new();
    for row in client
        .query("SELECT id, data FROM artifact_contents", &[])
        .await
        .map_err(read_err)?
    {
        let id: String = row.get(0);
        let data: Value = row.get(1);
        if let Some(dir) = &blob {
            if let Some(name) = data.get("blob").and_then(Value::as_str) {
                let content = std::fs::read_to_string(dir.join(name)).unwrap_or_default();
                out.push(ArtifactContent { id, content });
                continue;
            }
        }
        let parsed: ArtifactContent = serde_json::from_value(data)
            .map_err(|error| internal(format!("解析附件正文失败：{error}")))?;
        out.push(parsed);
    }
    Ok(out)
}

pub async fn load(pool: &Pool, with_contents: bool) -> Result<(i64, Snapshot), ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    ensure_seeded(&client).await?;
    load_with_client(&client, with_contents).await
}

/// 按差异把快照写进规范化表：只 upsert 变化行、删除消失行，事件/通知追加到自增表。
async fn persist(
    client: &deadpool_postgres::Client,
    snapshot: &mut Snapshot,
) -> Result<(), ApiError> {
    snapshot.revision += 1;
    for user in &snapshot.users {
        let data = serde_json::to_value(user).unwrap_or(Value::Null);
        client
            .execute(
                "INSERT INTO users(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                &[&user.id, &data],
            )
            .await
            .map_err(write_err)?;
    }
    for item in &snapshot.groups {
        let data = serde_json::to_value(item).unwrap_or(Value::Null);
        client
            .execute("INSERT INTO platform_groups(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", &[&item.id, &data])
            .await
            .map_err(write_err)?;
    }
    for item in &snapshot.platforms {
        let data = serde_json::to_value(item).unwrap_or(Value::Null);
        client
            .execute("INSERT INTO platforms(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", &[&item.id, &data])
            .await
            .map_err(write_err)?;
    }
    for item in &snapshot.projects {
        let data = serde_json::to_value(item).unwrap_or(Value::Null);
        client
            .execute("INSERT INTO projects(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", &[&item.id, &data])
            .await
            .map_err(write_err)?;
    }
    for item in &snapshot.iterations {
        let data = serde_json::to_value(item).unwrap_or(Value::Null);
        client
            .execute("INSERT INTO iterations(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", &[&item.id, &data])
            .await
            .map_err(write_err)?;
    }
    for item in &snapshot.skills {
        let data = serde_json::to_value(item).unwrap_or(Value::Null);
        client
            .execute("INSERT INTO skills(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", &[&item.id, &data])
            .await
            .map_err(write_err)?;
    }

    // 删除已不在快照里的需求（连同其通知）。
    let kept: Vec<String> = snapshot
        .requirements
        .iter()
        .map(|item| item.id.clone())
        .collect();
    client
        .execute(
            "DELETE FROM notifications WHERE requirement_id IS NOT NULL AND NOT (requirement_id = ANY($1))",
            &[&kept],
        )
        .await
        .map_err(write_err)?;
    client
        .execute(
            "DELETE FROM requirements WHERE NOT (id = ANY($1))",
            &[&kept],
        )
        .await
        .map_err(write_err)?;

    // requirements：用内容哈希跳过未变行。
    let existing: std::collections::HashMap<String, String> = {
        let mut map = std::collections::HashMap::new();
        for row in client
            .query("SELECT id, hash FROM requirements", &[])
            .await
            .map_err(read_err)?
        {
            let id: String = row.get(0);
            let hash: Option<String> = row.get(1);
            if let Some(hash) = hash {
                map.insert(id, hash);
            }
        }
        map
    };
    for item in &snapshot.requirements {
        let data = serde_json::to_value(item).unwrap_or(Value::Null);
        let text = data.to_string();
        let hash = db::hash_str(&text);
        if existing
            .get(&item.id)
            .map(|stored| stored == &hash)
            .unwrap_or(false)
        {
            continue;
        }
        client
            .execute(
                "INSERT INTO requirements(id,iteration_id,code,status,data,updated_at,hash)
                 VALUES($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT(id) DO UPDATE SET iteration_id=excluded.iteration_id, code=excluded.code, status=excluded.status, data=excluded.data, updated_at=excluded.updated_at, hash=excluded.hash",
                &[&item.id, &item.iteration_id, &item.code, &item.status, &data, &item.updated_at, &hash],
            )
            .await
            .map_err(write_err)?;
    }

    // 附件正文：快照里没有的删掉，新出现的写入；配置了 WORKBENCH_BLOB_DIR 时正文落文件、库里只存引用。
    let kept_artifacts: Vec<String> = snapshot
        .artifact_contents
        .iter()
        .map(|item| item.id.clone())
        .collect();
    let existing_artifacts: std::collections::HashSet<String> = client
        .query("SELECT id FROM artifact_contents", &[])
        .await
        .map_err(read_err)?
        .iter()
        .map(|row| row.get::<_, String>(0))
        .collect();
    if let Some(dir) = db::blob_dir() {
        for id in &existing_artifacts {
            if !kept_artifacts.contains(id) {
                let _ = std::fs::remove_file(dir.join(db::blob_safe_name(id)));
            }
        }
    }
    client
        .execute(
            "DELETE FROM artifact_contents WHERE NOT (id = ANY($1))",
            &[&kept_artifacts],
        )
        .await
        .map_err(write_err)?;
    for item in &snapshot.artifact_contents {
        if existing_artifacts.contains(&item.id) {
            continue;
        }
        let data = match db::blob_dir() {
            Some(dir) => {
                let name = db::blob_safe_name(&item.id);
                let _ = std::fs::create_dir_all(&dir);
                let _ = std::fs::write(dir.join(&name), item.content.as_bytes());
                serde_json::json!({ "blob": name })
            }
            None => serde_json::to_value(item).unwrap_or(Value::Null),
        };
        client
            .execute(
                "INSERT INTO artifact_contents(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                &[&item.id, &data],
            )
            .await
            .map_err(write_err)?;
    }

    // 追加事件 / 通知。
    for event in snapshot.pending_events.drain(..) {
        client
            .execute(
                "INSERT INTO events(at,actor_id,type,requirement_id,iteration_id,payload) VALUES($1,$2,$3,$4,$5,$6)",
                &[&crate::now_iso(), &event.actor_id, &event.kind, &event.requirement_id, &event.iteration_id, &event.payload],
            )
            .await
            .map_err(write_err)?;
    }
    for notification in snapshot.pending_notifications.drain(..) {
        client
            .execute(
                "INSERT INTO notifications(user_id,at,type,requirement_id,title,body,read) VALUES($1,$2,$3,$4,$5,$6,false)",
                &[&notification.user_id, &crate::now_iso(), &notification.kind, &notification.requirement_id, &notification.title, &notification.body],
            )
            .await
            .map_err(write_err)?;
    }

    client
        .execute(
            "INSERT INTO workbench_meta(key,value) VALUES('revision',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            &[&snapshot.revision.to_string()],
        )
        .await
        .map_err(write_err)?;
    Ok(())
}

fn write_err(error: tokio_postgres::Error) -> ApiError {
    internal(format!("写入 Postgres 状态失败：{error}"))
}

pub async fn mutate<T, F>(pool: &Pool, action: F) -> Result<T, ApiError>
where
    T: Send,
    F: FnOnce(&mut Snapshot) -> Result<T, ApiError> + Send,
{
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    client
        .batch_execute("BEGIN")
        .await
        .map_err(|error| internal(format!("开启事务失败：{error}")))?;
    // 事务级 advisory lock：串行化写入，COMMIT/ROLLBACK 自动释放；不对数据行加锁。
    client
        .execute("SELECT pg_advisory_xact_lock(7071)", &[])
        .await
        .map_err(|error| internal(format!("获取写锁失败：{error}")))?;
    let loaded = load_with_client(&client, true).await;
    let (_, mut snapshot) = match loaded {
        Ok(value) => value,
        Err(error) => {
            let _ = client.batch_execute("ROLLBACK").await;
            return Err(error);
        }
    };
    let result = match action(&mut snapshot) {
        Ok(value) => value,
        Err(error) => {
            let _ = client.batch_execute("ROLLBACK").await;
            return Err(error);
        }
    };
    if let Err(error) = persist(&client, &mut snapshot).await {
        let _ = client.batch_execute("ROLLBACK").await;
        return Err(error);
    }
    client
        .batch_execute("COMMIT")
        .await
        .map_err(|error| internal(format!("提交事务失败：{error}")))?;
    Ok(result)
}

pub async fn notifications_for(
    pool: &Pool,
    user_id: &str,
    limit: usize,
) -> Result<Vec<Notification>, ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    let rows = client
        .query(
            "SELECT id,user_id,at,type,requirement_id,title,body,read FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT $2",
            &[&user_id, &(limit as i64)],
        )
        .await
        .map_err(read_err)?;
    Ok(rows
        .iter()
        .map(|row| Notification {
            id: row.get(0),
            user_id: row.get(1),
            at: row.get(2),
            kind: row.get(3),
            requirement_id: row.get(4),
            title: row.get(5),
            body: row.get(6),
            read: row.get(7),
        })
        .collect())
}

pub async fn unread_notifications(pool: &Pool, user_id: &str) -> Result<i64, ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    let row = client
        .query_one(
            "SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read=false",
            &[&user_id],
        )
        .await
        .map_err(read_err)?;
    Ok(row.get(0))
}

pub async fn mark_notifications_read(
    pool: &Pool,
    user_id: &str,
    ids: Option<&[i64]>,
) -> Result<(), ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    match ids {
        Some(list) => {
            client
                .execute(
                    "UPDATE notifications SET read=true WHERE user_id=$1 AND id = ANY($2)",
                    &[&user_id, &list.to_vec()],
                )
                .await
                .map_err(write_err)?;
        }
        None => {
            client
                .execute(
                    "UPDATE notifications SET read=true WHERE user_id=$1",
                    &[&user_id],
                )
                .await
                .map_err(write_err)?;
        }
    }
    Ok(())
}

pub async fn events_since(pool: &Pool, since: i64, limit: usize) -> Result<Vec<Event>, ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    let rows = client
        .query(
            "SELECT id,at,actor_id,type,requirement_id,iteration_id,payload FROM events WHERE id > $1 ORDER BY id LIMIT $2",
            &[&since, &(limit as i64)],
        )
        .await
        .map_err(read_err)?;
    Ok(rows
        .iter()
        .map(|row| Event {
            id: row.get(0),
            at: row.get(1),
            actor_id: row.get(2),
            kind: row.get(3),
            requirement_id: row.get(4),
            iteration_id: row.get(5),
            payload: row.get(6),
        })
        .collect())
}

pub async fn has_webhook_delivery(pool: &Pool, delivery: &str) -> Result<bool, ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    let row = client
        .query_opt(
            "SELECT 1 FROM webhook_deliveries WHERE delivery = $1",
            &[&delivery],
        )
        .await
        .map_err(|error| internal(format!("查询 Webhook 去重表失败：{error}")))?;
    Ok(row.is_some())
}

pub async fn record_webhook_delivery(pool: &Pool, delivery: &str) -> Result<(), ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    client
        .execute(
            "INSERT INTO webhook_deliveries(delivery, seen_at) VALUES($1, $2) ON CONFLICT (delivery) DO NOTHING",
            &[&delivery, &crate::now_iso()],
        )
        .await
        .map_err(|error| internal(format!("写入 Webhook 去重表失败：{error}")))?;
    Ok(())
}

pub async fn load_revoked(pool: &Pool) -> Result<Vec<(String, i64)>, ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    let rows = client
        .query("SELECT jti, expires_at FROM revoked_tokens", &[])
        .await
        .map_err(|error| internal(format!("读取吊销表失败：{error}")))?;
    Ok(rows
        .iter()
        .map(|row| (row.get::<_, String>(0), row.get::<_, i64>(1)))
        .collect())
}

pub async fn insert_revoked(pool: &Pool, jti: &str, expires_at: i64) -> Result<(), ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    client
        .execute(
            "INSERT INTO revoked_tokens(jti, expires_at) VALUES($1, $2) ON CONFLICT (jti) DO UPDATE SET expires_at = excluded.expires_at",
            &[&jti, &expires_at],
        )
        .await
        .map_err(|error| internal(format!("写入吊销表失败：{error}")))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    client
        .execute("DELETE FROM revoked_tokens WHERE expires_at <= $1", &[&now])
        .await
        .map_err(|error| internal(format!("清理吊销表失败：{error}")))?;
    Ok(())
}
