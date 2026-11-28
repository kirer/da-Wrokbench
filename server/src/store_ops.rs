//! 存储分发：SQLite / Postgres 两种后端的统一读写入口（从 api.rs 拆出）。

use crate::api::{AppState, Store};
use crate::db::{self, Snapshot};
use crate::domain::ApiError;
use crate::models::{Event, Notification};
use axum::http::StatusCode;

pub(crate) fn lock_sqlite(
    state: &AppState,
) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, ApiError> {
    match &state.store {
        Store::Sqlite(db) => db
            .lock()
            .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "服务端状态锁失效")),
        Store::Postgres(_) => Err(ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "服务端配置错误：Postgres 后端不能使用 SQLite 连接",
        )),
    }
}

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
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::notifications_for(&conn, user_id, limit)?)
        }
        Store::Postgres(pool) => crate::pg::notifications_for(pool, user_id, limit).await,
    }
}

pub(crate) async fn unread_notifications(state: &AppState, user_id: &str) -> Result<i64, ApiError> {
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::unread_notifications(&conn, user_id)?)
        }
        Store::Postgres(pool) => crate::pg::unread_notifications(pool, user_id).await,
    }
}

pub(crate) async fn mark_notifications_read(
    state: &AppState,
    user_id: &str,
    ids: Option<&[i64]>,
) -> Result<(), ApiError> {
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::mark_notifications_read(&conn, user_id, ids)?)
        }
        Store::Postgres(pool) => crate::pg::mark_notifications_read(pool, user_id, ids).await,
    }
}

pub(crate) async fn events_since(
    state: &AppState,
    since: i64,
    limit: usize,
) -> Result<Vec<Event>, ApiError> {
    match &state.store {
        Store::Sqlite(_) => {
            let conn = lock_sqlite(state)?;
            Ok(db::events_since(&conn, since, limit)?)
        }
        Store::Postgres(pool) => crate::pg::events_since(pool, since, limit).await,
    }
}
