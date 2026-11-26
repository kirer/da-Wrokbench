#!/usr/bin/env bash
# 备份 SQLite 版工作台数据库。用 sqlite3 的 .backup（在线安全），不要直接 cp WAL 库。
# 用法：bash tools/workbench-db-backup.sh [数据库路径] [备份目录]
# 默认：$REPO_ROOT/runtime/server/workbench.db → ~/.dsh/backups/workbench-db/
# 环境变量：DATABASE_PATH（数据库）、WORKBENCH_DB_BACKUP_DIR（备份目录）、KEEP（保留份数，默认 14）
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${1:-${DATABASE_PATH:-$REPO_ROOT/runtime/server/workbench.db}}"
DEST_DIR="${2:-${WORKBENCH_DB_BACKUP_DIR:-$HOME/.dsh/backups/workbench-db}}"
KEEP="${KEEP:-14}"

echo_die() { echo "$*" >&2; exit 1; }

[ -f "$DB" ] || echo_die "找不到数据库：$DB（Postgres 部署请用 pg_dump，不走这个脚本）"
command -v sqlite3 >/dev/null 2>&1 || echo_die "需要 sqlite3 命令行"
case "$KEEP" in
  ''|*[!0-9]*) echo_die "KEEP 必须是正整数：$KEEP" ;;
esac
[ "$KEEP" -ge 1 ] || echo_die "KEEP 至少为 1"

mkdir -p "$DEST_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST_DIR/workbench-$STAMP.db"
case "$DB$OUT" in
  *"'"*) echo_die "路径里不能有单引号：$DB / $OUT" ;;
esac

umask 077
sqlite3 "$DB" ".backup '$OUT'"
chmod 600 "$OUT"

# 备份文件必须能打开且完整，否则宁可失败也不要留下一份坏备份。
CHECK="$(sqlite3 "$OUT" 'pragma integrity_check;' 2>&1 || true)"
if [ "$CHECK" != "ok" ]; then
  rm -f "$OUT"
  echo_die "备份完整性检查失败：$CHECK"
fi

# 只保留最近 KEEP 份（按修改时间倒序）。
COUNT="$(ls -1t "$DEST_DIR"/workbench-*.db 2>/dev/null | wc -l | tr -d ' ')"
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1t "$DEST_DIR"/workbench-*.db | tail -n "+$((KEEP + 1))" | while IFS= read -r old; do
    rm -f "$old"
  done
fi

echo "已备份：$OUT（权限 600，保留最近 $KEEP 份）"
