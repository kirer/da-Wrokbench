#!/usr/bin/env bash
# 清空研发工作台的测试数据，重启服务端和 DSH 桌面端（带调试端口）。
# 只用于测试环境；会退出桌面端并删除 ~/DSH-Workbench 下的数据。
#
# 用法：
#   bash tools/reset-workbench-test-data.sh
#   WORKBENCH_BASE="$HOME/DSH-Workbench" PORT=3210 bash tools/reset-workbench-test-data.sh
#
# 备份：~/.dsh/backups/workbench-reset-<时间>/
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${HOME}"
BASE="${WORKBENCH_BASE:-$HOME_DIR/DSH-Workbench}"
RUNTIME="${WORKBENCH_RUNTIME:-$REPO_ROOT/runtime}"
PORT="${PORT:-3210}"
BASE_URL="http://127.0.0.1:$PORT"
DB="${DATABASE_PATH:-$RUNTIME/server/workbench.db}"
SERVER_BIN="${WORKBENCH_SERVER_BIN:-$REPO_ROOT/server/target/debug/dsh-workbench-server}"
CDP_URL="${CDP_URL:-http://127.0.0.1:9222}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME_DIR/.dsh/backups/workbench-reset-$STAMP"
SESSION_ROOT="$HOME_DIR/.dsh/sessions"
WORKSPACE_JSON="$HOME_DIR/.dsh/storages/workspace.json"
CANVAS_STATE="$HOME_DIR/.dsh/dsh-workbench/canvas"
CACHE_DIR="$HOME_DIR/.dsh/cache/dsh-workbench"
LOCAL_MAP="$HOME_DIR/.dsh/cache/dsh-workbench-poc/local.json"

say() { printf '\n[reset] %s\n' "$*"; }
die() { printf '\n[reset] 失败：%s\n' "$*" >&2; exit 1; }

# 边界保护：BASE 必须是 HOME 下的子目录，不能是 HOME 本身或根目录
case "$BASE" in
  "$HOME_DIR"/*) ;;
  *) die "WORKBENCH_BASE 必须是 $HOME_DIR 下的子目录：$BASE" ;;
esac
[ "$BASE" != "$HOME_DIR" ] || die "WORKBENCH_BASE 不能是 HOME"
[ -n "${BASE#/}" ] || die "WORKBENCH_BASE 不能是根目录"

say "备份到 $BACKUP"
mkdir -p "$BACKUP/server" "$BACKUP/dsh" "$BACKUP/dsh-workbench" "$BACKUP/cache"
backup_path() {
  local src="$1" dest="$2"
  [ -e "$src" ] || return 0
  mkdir -p "$(dirname "$dest")"
  cp -R "$src" "$dest"
}
backup_path "$DB" "$BACKUP/server/workbench.db"
backup_path "$DB-wal" "$BACKUP/server/workbench.db-wal"
backup_path "$DB-shm" "$BACKUP/server/workbench.db-shm"
backup_path "$BASE" "$BACKUP/DSH-Workbench"
backup_path "$RUNTIME/workbench" "$BACKUP/runtime-workbench"
backup_path "$CANVAS_STATE/works.json" "$BACKUP/dsh-workbench/canvas/works.json"
backup_path "$CANVAS_STATE/gallery-state.json" "$BACKUP/dsh-workbench/canvas/gallery-state.json"
backup_path "$CACHE_DIR" "$BACKUP/cache/dsh-workbench"
backup_path "$LOCAL_MAP" "$BACKUP/cache/dsh-workbench-poc/local.json"
backup_path "$WORKSPACE_JSON" "$BACKUP/dsh/workspace.json"

say "退出 DSH 桌面端"
osascript -e 'quit app "DeepSeek Harness"' >/dev/null 2>&1 || true
sleep 2

say "停止 $PORT 上的工作台服务端"
PIDS="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PIDS" ]; then
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null || true
  for _ in $(seq 1 20); do
    lsof -ti tcp:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.3
  done
fi
lsof -ti tcp:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && die "端口 $PORT 仍被占用"

say "清空服务端数据库与本地目录"
rm -f "$DB" "$DB-wal" "$DB-shm"
mkdir -p "$BASE" "$RUNTIME/workbench" "$CACHE_DIR" "$CANVAS_STATE"
find "$BASE" -mindepth 1 -depth -delete
find "$RUNTIME/workbench" -mindepth 1 -depth -delete 2>/dev/null || true
find "$CACHE_DIR" -mindepth 1 -depth -delete 2>/dev/null || true
rm -f "$CANVAS_STATE/works.json" "$CANVAS_STATE/gallery-state.json" "$LOCAL_MAP"

say "清理 DSH 工作区与会话"
if [ -f "$WORKSPACE_JSON" ]; then
  BASE="$BASE" WORKSPACE_JSON="$WORKSPACE_JSON" SESSION_ROOT="$SESSION_ROOT" node <<'NODE'
const fs = require('fs')
const path = require('path')
const file = process.env.WORKSPACE_JSON
const base = process.env.BASE
const sessionRoot = process.env.SESSION_ROOT
const slug = (p) => p.replaceAll('/', '-').replace(/^-+/, '')
const j = JSON.parse(fs.readFileSync(file, 'utf8'))
const table = j.tables && j.tables.workspaces
if (!table) process.exit(0)
const entries = Array.isArray(table) ? table.map((w, i) => [String(i), w]) : Object.entries(table)
const removed = []
for (const [key, ws] of entries) {
  const p = ws && typeof ws.path === 'string' ? ws.path : ''
  if (p === base || p.startsWith(base + path.sep)) {
    removed.push(p)
    if (Array.isArray(table)) table[Number(key)] = null
    else delete table[key]
  }
}
if (Array.isArray(table)) j.tables.workspaces = table.filter(Boolean)
if (j.global && Array.isArray(j.global.workspaceIds) && !Array.isArray(table)) {
  j.global.workspaceIds = j.global.workspaceIds.filter(id => Object.hasOwn(j.tables.workspaces, id))
  if (!j.global.workspaceIds.includes(j.global.defaultWorkspaceId)) {
    j.global.defaultWorkspaceId = j.global.workspaceIds[0] || null
  }
}
const tmp = file + '.tmp'
fs.writeFileSync(tmp, JSON.stringify(j, null, 2) + '\n')
fs.renameSync(tmp, file)
for (const p of removed) {
  const dir = path.join(sessionRoot, `--${slug(p)}--`)
  fs.rmSync(dir, { recursive: true, force: true })
}
// 兜底：BASE 本身或 BASE 下路径留下的会话目录
const baseSlug = slug(base)
if (fs.existsSync(sessionRoot)) {
  for (const name of fs.readdirSync(sessionRoot)) {
    if (name.startsWith(`--${baseSlug}`) && name.endsWith('--')) {
      fs.rmSync(path.join(sessionRoot, name), { recursive: true, force: true })
    }
  }
}
console.log(`removed workspaces: ${removed.length}${removed.length ? ' -> ' + removed.join(', ') : ''}`)
NODE
else
  say "没有 workspace.json，跳过"
fi

say "启动服务端"
[ -x "$SERVER_BIN" ] || die "找不到服务端可执行文件：$SERVER_BIN（先 cd server && cargo build）"
mkdir -p "$(dirname "$DB")" "$RUNTIME/server"
SERVER_LOG="$RUNTIME/server/server.log"
: > "$SERVER_LOG"
(
  cd "$REPO_ROOT/server"
  DATABASE_PATH="$DB" PORT="$PORT" nohup "$SERVER_BIN" >>"$SERVER_LOG" 2>&1 &
  echo $! > "$RUNTIME/server/server.pid"
)
curl -sf --retry 60 --retry-delay 1 --retry-connrefused "$BASE_URL/health" > "$BACKUP/health.json" \
  || { tail -40 "$SERVER_LOG" >&2; die "服务端没有在 $BASE_URL 起来"; }
cat "$BACKUP/health.json"; echo

say "启动 DSH 桌面端（调试端口 9222）"
open -n -a "DeepSeek Harness" --args --remote-debugging-port=9222
curl -sf --retry 40 --retry-delay 1 --retry-connrefused "$CDP_URL/json/version" >/dev/null \
  || die "桌面端没有开放调试端口 $CDP_URL"

say "完成"
say "备份：$BACKUP"
say "数据库：$DB（重启后由服务端写入种子数据）"
say "下一步：node e2e/desktop-s13.mjs --preflight"
