#!/usr/bin/env bash
# DSH 会话状态备份 / 恢复 / 清理。
#
# 用法：
#   tools/dsh-session-backup.sh backup [标签]
#   tools/dsh-session-backup.sh list
#   tools/dsh-session-backup.sh restore <备份文件> [--yes]
#   tools/dsh-session-backup.sh clear-workbench-sessions [--yes]
#   tools/dsh-session-backup.sh clear-all-sessions [--yes]
#
# 环境变量：
#   DSH_HOME         DSH 数据目录，默认 ~/.dsh
#   BACKUP_DIR       备份目录，默认 ~/.dsh-session-backups
#   KEEP             保留最近几份备份，默认 10
#   WORKBENCH_BASE   工作台顶级文件夹，默认 poc/runtime/workbench
#
# restore / clear-* 会先自动退出 DeepSeek Harness（⌘Q 同效），
# 再自动做一份 pre-restore / pre-clear 备份；项目目录本身不会被删除。
set -euo pipefail
# 备份包含会话正文和本机路径，只允许当前用户读写。
umask 077

DSH_HOME=${DSH_HOME:-"$HOME/.dsh"}
DSH_HOME=${DSH_HOME%/}
BACKUP_DIR=${BACKUP_DIR:-"$HOME/.dsh-session-backups"}
KEEP=${KEEP:-10}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKBENCH_BASE=${WORKBENCH_BASE:-"$SCRIPT_DIR/../runtime/workbench"}
APP_BIN='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness'
RESTORE_TMP=''
trap 'if [[ -n "$RESTORE_TMP" ]]; then rm -rf "$RESTORE_TMP"; fi' EXIT

STATE_ITEMS=(
  storages/workspace.json
  storages/session_projcache
  storages/session_projcache_archive_manager_v2
  sessions
  cache/dsh-workbench-poc/local.json
)

usage() {
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
}

app_running() {
  pgrep -f "$APP_BIN" >/dev/null 2>&1
}

quit_app() {
  if ! app_running; then return 0; fi
  echo "DeepSeek Harness 正在运行，正在退出应用…"
  osascript -e 'quit app "DeepSeek Harness"' >/dev/null 2>&1 || true
  local i
  for i in $(seq 1 40); do
    app_running || return 0
    sleep 0.5
  done
  pkill -TERM -f "$APP_BIN" 2>/dev/null || true
  sleep 2
  if app_running; then
    echo "无法退出 DeepSeek Harness，请手动 ⌘Q 后重试。" >&2
    exit 1
  fi
  return 0
}

require_app_closed() {
  # 只在操作真实 ~/.dsh 时处理；临时 DSH_HOME 用于演练/测试。
  if [[ "$DSH_HOME" != "$HOME/.dsh" ]]; then return 0; fi
  quit_app
}

prune_backups() {
  local pruned
  pruned=$(ls -1t "$BACKUP_DIR"/dsh-sessions-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) || true)
  if [[ -n "$pruned" ]]; then
    echo "$pruned" | while IFS= read -r file; do
      [[ -n "$file" ]] || continue
      rm -f "$file" "$file.manifest.txt"
    done
  fi
}

cmd_backup() {
  local label
  label=$(printf '%s' "${1:-manual}" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-40)
  [[ -n "$label" ]] || label=manual
  local stamp name tmp manifest
  stamp=$(date +%Y%m%d-%H%M%S)
  name="dsh-sessions-$stamp-$label.tar.gz"
  tmp="$BACKUP_DIR/.$name.partial"
  manifest="$BACKUP_DIR/$name.manifest.txt"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  local items=()
  local item
  for item in "${STATE_ITEMS[@]}"; do
    [[ -e "$DSH_HOME/$item" ]] && items+=("$item")
  done
  if (( ${#items[@]} == 0 )); then
    echo "没有可备份的 DSH 状态：$DSH_HOME" >&2
    return 1
  fi
  rm -f "$tmp"
  if ! tar -czf "$tmp" -C "$DSH_HOME" "${items[@]}"; then
    rm -f "$tmp"
    echo "备份打包失败，未写入正式备份：$DSH_HOME" >&2
    return 1
  fi
  if ! tar -tzf "$tmp" >/dev/null 2>&1; then
    rm -f "$tmp"
    echo "备份校验失败，未写入正式备份：$DSH_HOME" >&2
    return 1
  fi
  chmod 600 "$tmp"
  {
    echo "created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "dsh_home=$DSH_HOME"
    echo "items=${items[*]}"
  } > "$manifest"
  chmod 600 "$manifest"
  mv -f "$tmp" "$BACKUP_DIR/$name"
  echo "已备份到 $BACKUP_DIR/$name"
  prune_backups
}

cmd_list() {
  mkdir -p "$BACKUP_DIR"
  local files
  files=$(ls -1t "$BACKUP_DIR"/dsh-sessions-*.tar.gz 2>/dev/null || true)
  if [[ -z "$files" ]]; then
    echo "还没有备份：$BACKUP_DIR"
    return 0
  fi
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    printf '%s  %8s  %s\n' "$(date -r "$file" '+%Y-%m-%d %H:%M:%S')" "$(du -h "$file" | cut -f1)" "$file"
  done <<< "$files"
}

cmd_restore() {
  local archive=${1:-}
  local yes=${2:-}
  if [[ -z "$archive" || ! -f "$archive" ]]; then
    echo "用法：$0 restore <备份文件> [--yes]" >&2
    exit 1
  fi
  require_app_closed
  tar -tzf "$archive" >/dev/null
  if ! tar -tzf "$archive" | grep -qx 'storages/workspace.json'; then
    echo "不是有效的 DSH 会话备份（缺少 storages/workspace.json）：$archive" >&2
    exit 1
  fi
  if tar -tzf "$archive" | awk 'BEGIN { bad = 0 } /^\// || /(^|\/)\.\.(\/|$)/ { bad = 1 } END { exit bad }'; then
    :
  else
    echo "备份包含越界路径，拒绝恢复：$archive" >&2
    exit 1
  fi
  if [[ "$yes" != "--yes" ]]; then
    local answer
    read -r -p "将用 $archive 覆盖 $DSH_HOME 的会话状态（先自动备份当前状态），继续？[y/N] " answer
    [[ "$answer" == [yY]* ]] || { echo "已取消"; exit 1; }
  fi
  if ! cmd_backup pre-restore; then
    echo "恢复前的当前状态备份失败，已中止恢复（不会破坏现有会话）。" >&2
    exit 1
  fi
  RESTORE_TMP=$(mktemp -d)
  tar -xzf "$archive" -C "$RESTORE_TMP"
  local item
  for item in "${STATE_ITEMS[@]}"; do
    if [[ -e "$RESTORE_TMP/$item" ]]; then
      rm -rf "$DSH_HOME/$item"
      mkdir -p "$(dirname "$DSH_HOME/$item")"
      mv "$RESTORE_TMP/$item" "$DSH_HOME/$item"
    fi
  done
  # 旧版清理脚本会写出 defaultWorkspaceId: null，DSH 的 workspace 域不接受
  # （optional string），会让 workspaceController 无法激活。恢复时顺手修正。
  python3 -I - "$DSH_HOME/storages/workspace.json" <<'PYEOF'
import json
import os
import sys

path = sys.argv[1]
if os.path.exists(path):
    with open(path, encoding='utf-8') as handle:
        registry = json.load(handle)
    global_state = registry.get('global') or {}
    workspaces = (registry.get('tables') or {}).get('workspaces') or {}
    changed = False
    if 'defaultWorkspaceId' in global_state and global_state['defaultWorkspaceId'] is None:
        global_state.pop('defaultWorkspaceId')
        changed = True
    default_id = global_state.get('defaultWorkspaceId', None)
    if default_id is not None and default_id not in workspaces:
        order = global_state.get('workspaceIds') or []
        if order:
            global_state['defaultWorkspaceId'] = order[0]
        else:
            global_state.pop('defaultWorkspaceId', None)
        changed = True
    if changed:
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as handle:
            json.dump(registry, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        print('已修正 workspace.json 的 defaultWorkspaceId 字段')
PYEOF
  echo "已从 $archive 恢复 $DSH_HOME"
}

cmd_clear_workbench_sessions() {
  local yes=${1:-}
  require_app_closed
  if [[ -z "$WORKBENCH_BASE" || "$WORKBENCH_BASE" != /* || ! -d "$WORKBENCH_BASE" ]]; then
    echo "工作台顶级文件夹无效或不存在：$WORKBENCH_BASE" >&2
    exit 1
  fi
  WORKBENCH_BASE=$(cd "$WORKBENCH_BASE" && pwd -P)
  case "$WORKBENCH_BASE" in
    /|"$HOME"|"$DSH_HOME")
      echo "拒绝把 $WORKBENCH_BASE 当作工作台顶级文件夹清理，请设置更具体的 WORKBENCH_BASE。" >&2
      exit 1
      ;;
  esac
  if [[ ! -f "$DSH_HOME/storages/workspace.json" ]]; then
    echo "DSH 工作区注册表不存在：$DSH_HOME/storages/workspace.json" >&2
    exit 1
  fi
  if [[ "$yes" != "--yes" ]]; then
    local answer
    read -r -p "将删除 $WORKBENCH_BASE 下的 DSH 工作区与会话（先自动备份），继续？[y/N] " answer
    [[ "$answer" == [yY]* ]] || { echo "已取消"; exit 1; }
  fi
  if ! cmd_backup pre-clear; then
    echo "清理前的备份失败，已中止清理（不会删除会话）。" >&2
    exit 1
  fi
  python3 -I - "$DSH_HOME" "$WORKBENCH_BASE" <<'PYEOF'
import json
import os
import shutil
import sys

dsh_home = os.path.abspath(sys.argv[1])
workbench_base = os.path.realpath(sys.argv[2])


def inside(path):
    if not isinstance(path, str) or path == '':
        return False
    try:
        resolved = os.path.realpath(path)
        return os.path.commonpath([workbench_base, resolved]) == workbench_base
    except ValueError:
        return False


workspace_file = os.path.join(dsh_home, 'storages', 'workspace.json')
with open(workspace_file, encoding='utf-8') as handle:
    registry = json.load(handle)

workspaces = registry['tables']['workspaces']
targets = {wid: row for wid, row in workspaces.items() if inside(row.get('path', ''))}
if not targets:
    print('没有需要清理的工作台工作区')
    sys.exit(0)

purged = set()
for row in targets.values():
    purged.update(row.get('sessionIds', []))

for wid in targets:
    del workspaces[wid]

global_state = registry['global']
global_state['workspaceIds'] = [wid for wid in global_state.get('workspaceIds', []) if wid not in targets]
global_state['archivedSessionIds'] = [sid for sid in global_state.get('archivedSessionIds', []) if sid not in purged]
global_state['pinnedSessionIds'] = [sid for sid in global_state.get('pinnedSessionIds', []) if sid not in purged]
# defaultWorkspaceId 在 DSH 的 zod schema 里是 optional string：没有默认工作区时
# 必须删掉这个键，写成 null 会让 workspace 域校验失败，workspaceController 无法激活。
if global_state.get('defaultWorkspaceId') not in workspaces:
    if global_state['workspaceIds']:
        global_state['defaultWorkspaceId'] = global_state['workspaceIds'][0]
    else:
        global_state.pop('defaultWorkspaceId', None)

tmp = workspace_file + '.tmp'
with open(tmp, 'w', encoding='utf-8') as handle:
    json.dump(registry, handle, ensure_ascii=False, indent=2)
os.replace(tmp, workspace_file)

removed_session_dirs = 0
sessions_root = os.path.join(dsh_home, 'sessions')
if os.path.isdir(sessions_root):
    for entry in sorted(os.listdir(sessions_root)):
        folder = os.path.join(sessions_root, entry)
        if not os.path.isdir(folder):
            continue
        for sid in sorted(os.listdir(folder)):
            if sid in purged:
                shutil.rmtree(os.path.join(folder, sid))
                removed_session_dirs += 1
        try:
            if not os.listdir(folder):
                os.rmdir(folder)
        except OSError:
            pass

removed_projcache = 0
projcache_dir = os.path.join(dsh_home, 'storages', 'session_projcache', 'sessions')
if os.path.isdir(projcache_dir):
    for sid in purged:
        path = os.path.join(projcache_dir, sid + '.json')
        if os.path.exists(path):
            os.remove(path)
            removed_projcache += 1

local_file = os.path.join(dsh_home, 'cache', 'dsh-workbench-poc', 'local.json')
if os.path.exists(local_file):
    with open(local_file, encoding='utf-8') as handle:
        local = json.load(handle)
    for user in (local.get('users') or {}).values():
        for key in ('dshSessions', 'sessionOwners', 'sessionUsers'):
            mapping = user.get(key) or {}
            for sid in list(mapping):
                if sid in purged:
                    del mapping[sid]
        records = user.get('sessions') or {}
        for record_id in list(records):
            record = records[record_id]
            if record.get('dshSessionId') in purged or inside(record.get('folderPath', '')):
                records.pop(record_id, None)
                sid = record.get('dshSessionId')
                if sid:
                    for key in ('dshSessions', 'sessionOwners', 'sessionUsers'):
                        (user.get(key) or {}).pop(sid, None)
        folders = user.get('folders') or {}
        for requirement_id in list(folders):
            if inside(folders[requirement_id]):
                del folders[requirement_id]
    tmp = local_file + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(local, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, local_file)


def is_empty_tree(path):
    # 只有空目录和 Finder 的 .DS_Store 时视为空目录树，可以安全删除。
    for root, dirs, files in os.walk(path):
        if any(name != '.DS_Store' for name in files):
            return False
        for name in dirs:
            if os.path.islink(os.path.join(root, name)):
                return False
    return True


removed_folders = []
for row in targets.values():
    path = row.get('path', '')
    if inside(path) and os.path.isdir(path) and path != workbench_base and is_empty_tree(path):
        shutil.rmtree(path)
        removed_folders.append(path)

print(f'已删除工作区 {len(targets)} 个、会话 {len(purged)} 个、会话目录 {removed_session_dirs} 个、缓存 {removed_projcache} 个')
if removed_folders:
    print('已删除空目录：')
    for path in removed_folders:
        print('  ' + path)
PYEOF
}

cmd_clear_all_sessions() {
  local yes=${1:-}
  require_app_closed
  if [[ ! -f "$DSH_HOME/storages/workspace.json" ]]; then
    echo "DSH 工作区注册表不存在：$DSH_HOME/storages/workspace.json" >&2
    exit 1
  fi
  if [[ "$yes" != "--yes" ]]; then
    local answer
    read -r -p "将清空所有项目的 DSH 工作区与会话（先自动备份，项目目录本身不动），继续？[y/N] " answer
    [[ "$answer" == [yY]* ]] || { echo "已取消"; exit 1; }
  fi
  if ! cmd_backup pre-clear-all; then
    echo "清理前的备份失败，已中止清理（不会删除会话）。" >&2
    exit 1
  fi
  python3 -I - "$DSH_HOME" <<'PYEOF'
import json
import os
import shutil
import sys

dsh_home = os.path.abspath(sys.argv[1])
workspace_file = os.path.join(dsh_home, 'storages', 'workspace.json')
with open(workspace_file, encoding='utf-8') as handle:
    registry = json.load(handle)

workspaces = registry['tables']['workspaces']
workspace_count = len(workspaces)
session_count = len({sid for row in workspaces.values() for sid in row.get('sessionIds', [])})
registry['tables']['workspaces'] = {}
global_state = registry['global']
global_state['workspaceIds'] = []
global_state['archivedSessionIds'] = []
global_state['pinnedSessionIds'] = []
# 同上：空注册表必须删除 optional 的 defaultWorkspaceId，不能写成 null。
global_state.pop('defaultWorkspaceId', None)

tmp = workspace_file + '.tmp'
with open(tmp, 'w', encoding='utf-8') as handle:
    json.dump(registry, handle, ensure_ascii=False, indent=2)
os.replace(tmp, workspace_file)

removed_dirs = 0
sessions_root = os.path.join(dsh_home, 'sessions')
if os.path.isdir(sessions_root):
    for entry in sorted(os.listdir(sessions_root)):
        path = os.path.join(sessions_root, entry)
        if os.path.islink(path):
            continue
        if os.path.isdir(path):
            shutil.rmtree(path)
            removed_dirs += 1
        else:
            os.remove(path)
            removed_dirs += 1

removed_projcache = 0
for relative in (
    ('storages', 'session_projcache', 'sessions'),
    ('storages', 'session_projcache_archive_manager_v2', 'sessions'),
):
    folder = os.path.join(dsh_home, *relative)
    if not os.path.isdir(folder):
        continue
    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        if os.path.isdir(path) and not os.path.islink(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
        removed_projcache += 1

local_file = os.path.join(dsh_home, 'cache', 'dsh-workbench-poc', 'local.json')
if os.path.exists(local_file):
    with open(local_file, encoding='utf-8') as handle:
        local = json.load(handle)
    for user in (local.get('users') or {}).values():
        user['sessions'] = {}
        user['folders'] = {}
        user['dshSessions'] = {}
        user['sessionOwners'] = {}
        user['sessionUsers'] = {}
    tmp = local_file + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(local, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, local_file)

print(f'已清空工作区 {workspace_count} 个、会话 {session_count} 个、会话目录 {removed_dirs} 个、缓存 {removed_projcache} 个；项目目录未删除')
PYEOF
}

case "${1:-}" in
  backup) shift; cmd_backup "${1:-manual}" ;;
  list) cmd_list ;;
  restore) shift; cmd_restore "${1:-}" "${2:-}" ;;
  clear-workbench-sessions) shift; cmd_clear_workbench_sessions "${1:-}" ;;
  clear-all-sessions) shift; cmd_clear_all_sessions "${1:-}" ;;
  -h|--help|help|'') usage ;;
  *) echo "未知命令：$1" >&2; usage; exit 1 ;;
esac
