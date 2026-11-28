//! 存储分发：SQLite / Postgres 两种后端的统一读写入口（从 api.rs 拆出）。

use crate::api::{AppState, Store};
use crate::db::{self, Snapshot};
use crate::domain::ApiError;
use crate::models::{Event, Notification};
use axum::http::StatusCode;

pub(crate) async fn read_snapshot(state: &AppState) -> Result<Snapshot, ApiError> {
    match &state.store {
        Store::Sqlite(db) => {
            // SQLite 是同步阻塞 IO：放到 blocking 线程跑，别卡住 Tokio 工作线程
            // （/state 每 3 秒被轮询一次，这是最热的读路径）。
            let db = db.clone();
            tokio::task::spawn_blocking(move || -> Result<Snapshot, ApiError> {
                let conn = db.lock().map_err(|_| {
                    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "服务端状态锁失效")
                })?;
                Ok(db::load_snapshot_without_contents(&conn)?)
            })
            .await
            .map_err(|error| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("读取数据库线程失败：{error}"),
                )
            })?
        }
        Store::Postgres(pool) => {
            let (_, snapshot) = crate::pg::load(pool, false).await?;
            Ok(snapshot)
        }
    }
}

pub(crate) async fn mutate<T, F>(state: &AppState, action: F) -> Result<T, ApiError>
where
    T: Send,
    F: FnOnce(&mut Snapshot) -> Result<T, ApiError> + Send,
{
    match &state.store {
        Store::Sqlite(db) => {
            // SQLite 写是同步阻塞 IO：block_in_place 让出 worker，避免大事务期间卡住整个运行时线程。
            let db = db.clone();
            tokio::task::block_in_place(|| -> Result<T, ApiError> {
                let mut conn = db.lock().map_err(|_| {
                    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "服务端状态锁失效")
                })?;
                let mut snapshot = db::load_snapshot(&conn)?;
                let result = action(&mut snapshot)?;
                let tx = conn.transaction()?;
                db::save_snapshot(&tx, &mut snapshot)?;
                tx.commit()?;
                Ok(result)
            })
        }
        Store::Postgres(pool) => crate::pg::mutate(pool, action).await,
    }
}

pub(crate) async fn notifications_for(
    state: &AppState,
    user_id: &str,
    limit: usize,
) -> Result<Vec<Notification>, ApiError> {
    match &state.store {
        Store::Postgres(pool) => crate::pg::notifications_for(pool, user_id, limit).await,
        Store::Sqlite(_) => {
            let user_id = user_id.to_string();
            with_sqlite_blocking(state, move |conn| {
                Ok(db::notifications_for(conn, &user_id, limit)?)
            })
            .await
        }
    }
}

pub(crate) async fn unread_notifications(state: &AppState, user_id: &str) -> Result<i64, ApiError> {
    match &state.store {
        Store::Postgres(pool) => crate::pg::unread_notifications(pool, user_id).await,
        Store::Sqlite(_) => {
            let user_id = user_id.to_string();
            with_sqlite_blocking(state, move |conn| {
                Ok(db::unread_notifications(conn, &user_id)?)
            })
            .await
        }
    }
}

pub(crate) async fn mark_notifications_read(
    state: &AppState,
    user_id: &str,
    ids: Option<&[i64]>,
) -> Result<(), ApiError> {
    match &state.store {
        Store::Postgres(pool) => crate::pg::mark_notifications_read(pool, user_id, ids).await,
        Store::Sqlite(_) => {
            let user_id = user_id.to_string();
            let ids = ids.map(|slice| slice.to_vec());
            with_sqlite_blocking(state, move |conn| {
                Ok(db::mark_notifications_read(conn, &user_id, ids.as_deref())?)
            })
            .await
        }
    }
}

pub(crate) async fn events_since(
    state: &AppState,
    since: i64,
    limit: usize,
) -> Result<Vec<Event>, ApiError> {
    match &state.store {
        Store::Postgres(pool) => crate::pg::events_since(pool, since, limit).await,
        Store::Sqlite(_) => {
            with_sqlite_blocking(state, move |conn| Ok(db::events_since(conn, since, limit)?)).await
        }
    }
}

/// 在 blocking 线程池里拿 SQLite 连接做一次同步查询，避免占住 Tokio 工作线程等锁。
pub(crate) async fn with_sqlite_blocking<R, F>(state: &AppState, f: F) -> Result<R, ApiError>
where
    R: Send + 'static,
    F: FnOnce(&rusqlite::Connection) -> Result<R, ApiError> + Send + 'static,
{
    match &state.store {
        Store::Sqlite(db) => {
            let db = db.clone();
            tokio::task::spawn_blocking(move || {
                let conn = db.lock().map_err(|_| {
                    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "服务端状态锁失效")
                })?;
                f(&conn)
            })
            .await
            .map_err(|error| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("数据库线程失败：{error}"),
                )
            })?
        }
        Store::Postgres(_) => Err(ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "with_sqlite_blocking 只用于 SQLite 后端",
        )),
    }
}

/// 轻量读取全局修订号（用于 ETag 提前判断，避免加载整份快照）。
pub(crate) async fn state_revision(state: &AppState) -> Result<i64, ApiError> {
    match &state.store {
        Store::Postgres(pool) => crate::pg::revision(pool).await,
        Store::Sqlite(_) => with_sqlite_blocking(state, |conn| Ok(db::revision(conn)?)).await,
    }
}

/// 当前用户的通知水位：(未读数, 该用户最新通知 id)，用于把「已读/新通知」纳入 ETag。
pub(crate) async fn notification_watermark(
    state: &AppState,
    user_id: &str,
) -> Result<(i64, i64), ApiError> {
    match &state.store {
        Store::Postgres(pool) => crate::pg::notification_watermark(pool, user_id).await,
        Store::Sqlite(_) => {
            let user_id = user_id.to_string();
            with_sqlite_blocking(state, move |conn| {
                Ok(db::notification_watermark(conn, &user_id)?)
            })
            .await
        }
    }
}

/// 当前最大事件 id（SSE 未带 since 时从「现在」开始，不回放历史）。
pub(crate) async fn latest_event_id(state: &AppState) -> Result<i64, ApiError> {
    match &state.store {
        Store::Postgres(pool) => crate::pg::latest_event_id(pool).await,
        Store::Sqlite(_) => {
            with_sqlite_blocking(state, |conn| Ok(db::latest_event_id(conn)?)).await
        }
    }
}
