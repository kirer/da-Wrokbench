//! Postgres persistence.
//!
//! POC 的 SQLite 后端每次变更写全量快照；Postgres 后端沿用同一份 `Snapshot`，
//! 但把整份状态放进一行 JSONB，并用行锁 + version 做串行化和乐观并发控制。
//! 这样可以在不重写领域层的前提下支持多实例部署。后续数据量上来后，再把
//! requirements/events/notifications 拆成独立表做增量写。

use crate::db::{self, Snapshot};
use crate::domain::ApiError;
use crate::models::{Event, Notification};
use axum::http::StatusCode;
use deadpool_postgres::{Manager, ManagerConfig, RecyclingMethod, Runtime};
use serde_json::Value;
use tokio_postgres::NoTls;

pub use deadpool_postgres::Pool;

fn internal(message: impl Into<String>) -> ApiError {
    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, message)
}

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
        .max_size(8)
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
        .batch_execute(
            r#"
            CREATE TABLE IF NOT EXISTS workbench_state (
                id SMALLINT PRIMARY KEY,
                version BIGINT NOT NULL,
                data JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            "#,
        )
        .await
        .map_err(|error| format!("初始化 Postgres 表失败：{error}"))?;
    ensure_seeded(&client).await.map_err(|error| error.message)?;
    Ok(())
}

async fn ensure_seeded(client: &deadpool_postgres::Client) -> Result<(), ApiError> {
    let count: i64 = client
        .query_one("SELECT COUNT(*) FROM workbench_state", &[])
        .await
        .map_err(|error| internal(format!("读取 Postgres 状态失败：{error}")))?
        .get(0);
    if count > 0 {
        return Ok(());
    }
    if !db::demo_seed_enabled() {
        tracing::warn!(
            "空数据库且未启用演示数据；生产环境请先导入管理员账号（仅演示可设置 WORKBENCH_SEED_DEMO=1）"
        );
        return Ok(());
    }
    let mut snapshot = db::seed_snapshot();
    db::append_pending(&mut snapshot);
    let data = serde_json::to_value(&snapshot)
        .map_err(|error| internal(format!("序列化种子数据失败：{error}")))?;
    client
        .execute(
            "INSERT INTO workbench_state(id, version, data) VALUES(1, 1, $1) ON CONFLICT (id) DO NOTHING",
            &[&data],
        )
        .await
        .map_err(|error| internal(format!("写入种子数据失败：{error}")))?;
    Ok(())
}

/// 轻量健康检查：只验证连接可用，不读取整份快照。
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

pub async fn load(pool: &Pool) -> Result<(i64, Snapshot), ApiError> {
    let client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    ensure_seeded(&client).await?;
    let row = client
        .query_one("SELECT version, data FROM workbench_state WHERE id = 1", &[])
        .await
        .map_err(|error| internal(format!("读取 Postgres 状态失败：{error}")))?;
    let version: i64 = row.get(0);
    let data: Value = row.get(1);
    let mut snapshot: Snapshot = serde_json::from_value(data)
        .map_err(|error| internal(format!("解析 Postgres 状态失败：{error}")))?;
    snapshot.ensure_projects();
    Ok((version, snapshot))
}

pub async fn mutate<T, F>(pool: &Pool, action: F) -> Result<T, ApiError>
where
    T: Send,
    F: FnOnce(&mut Snapshot) -> Result<T, ApiError> + Send,
{
    let mut client = pool
        .get()
        .await
        .map_err(|error| internal(format!("获取 Postgres 连接失败：{error}")))?;
    let tx = client
        .transaction()
        .await
        .map_err(|error| internal(format!("开启 Postgres 事务失败：{error}")))?;

    let row = tx
        .query_opt(
            "SELECT version, data FROM workbench_state WHERE id = 1 FOR UPDATE",
            &[],
        )
        .await
        .map_err(|error| internal(format!("锁定 Postgres 状态失败：{error}")))?;
    let (version, mut snapshot): (i64, Snapshot) = match row {
        Some(row) => {
            let version: i64 = row.get(0);
            let data: Value = row.get(1);
            let mut snapshot: Snapshot = serde_json::from_value(data)
                .map_err(|error| internal(format!("解析 Postgres 状态失败：{error}")))?;
            snapshot.ensure_projects();
            (version, snapshot)
        }
        None => {
            let mut seed = db::seed_snapshot();
            db::append_pending(&mut seed);
            (0, seed)
        }
    };

    let result = action(&mut snapshot)?;
    db::append_pending(&mut snapshot);
    let data = serde_json::to_value(&snapshot)
        .map_err(|error| internal(format!("序列化 Postgres 状态失败：{error}")))?;
    let next = version + 1;
    let changed = if version == 0 {
        tx.execute(
            "INSERT INTO workbench_state(id, version, data) VALUES(1, $1, $2)",
            &[&next, &data],
        )
        .await
    } else {
        tx.execute(
            "UPDATE workbench_state SET version = $1, data = $2, updated_at = now()
             WHERE id = 1 AND version = $3",
            &[&next, &data, &version],
        )
        .await
    }
    .map_err(|error| internal(format!("写入 Postgres 状态失败：{error}")))?;
    if changed != 1 {
        return Err(ApiError::conflict("数据已被其他实例修改，请重试"));
    }
    tx.commit()
        .await
        .map_err(|error| internal(format!("提交 Postgres 事务失败：{error}")))?;
    Ok(result)
}

pub async fn notifications_for(
    pool: &Pool,
    user_id: &str,
    limit: usize,
) -> Result<Vec<Notification>, ApiError> {
    let (_, snapshot) = load(pool).await?;
    let mut items: Vec<Notification> = snapshot
        .notifications
        .into_iter()
        .filter(|item| item.user_id == user_id)
        .collect();
    items.sort_by_key(|item| std::cmp::Reverse(item.id));
    items.truncate(limit);
    Ok(items)
}

pub async fn unread_notifications(pool: &Pool, user_id: &str) -> Result<i64, ApiError> {
    let (_, snapshot) = load(pool).await?;
    Ok(snapshot
        .notifications
        .iter()
        .filter(|item| item.user_id == user_id && !item.read)
        .count() as i64)
}

pub async fn mark_notifications_read(
    pool: &Pool,
    user_id: &str,
    ids: Option<&[i64]>,
) -> Result<(), ApiError> {
    let user_id = user_id.to_string();
    let ids = ids.map(|list| list.to_vec());
    mutate(pool, move |snapshot| {
        for item in snapshot.notifications.iter_mut() {
            if item.user_id != user_id {
                continue;
            }
            if ids
                .as_ref()
                .map(|list| list.contains(&item.id))
                .unwrap_or(true)
            {
                item.read = true;
            }
        }
        Ok(())
    })
    .await
}

pub async fn events_since(pool: &Pool, since: i64, limit: usize) -> Result<Vec<Event>, ApiError> {
    let (_, snapshot) = load(pool).await?;
    let mut items: Vec<Event> = snapshot
        .events
        .into_iter()
        .filter(|item| item.id > since)
        .collect();
    items.sort_by_key(|item| item.id);
    items.truncate(limit);
    Ok(items)
}
