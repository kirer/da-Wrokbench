#!/usr/bin/env bash
# 钉钉 / GitLab 集成回归。启动一个临时服务端和本地 mock，不需要真实企业凭据。
# 依赖：cargo build 产物、node、curl、jq。
set -euo pipefail
cd "$(dirname "$0")"

BIN="${BIN:-./target/debug/dsh-workbench-server}"
PORT="${PORT:-3212}"
MOCK_PORT="${MOCK_PORT:-4399}"
BASE="http://127.0.0.1:$PORT"
MOCK="http://127.0.0.1:$MOCK_PORT"
TMP_DIR="$(mktemp -d)"
SERVER_PID=""
MOCK_PID=""
BODY_FILE="$TMP_DIR/body.json"
pass=0
fail=0

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true
  # 回收子进程，避免 shell 在退出时打印 Terminated 干扰测试结论。
  [ -n "$SERVER_PID" ] && wait "$SERVER_PID" 2>/dev/null || true
  [ -n "$MOCK_PID" ] && wait "$MOCK_PID" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ok() { pass=$((pass + 1)); printf '  ✓ %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  ✗ %s\n' "$1" >&2; }
check() {
  local name="$1" condition="$2"
  if [ "$condition" = "$3" ]; then ok "$name"; else bad "$name（期望 $3，实际 $condition）"; fi
}

status() { curl -s -o "$BODY_FILE" -w '%{http_code}' "$@"; }
expect() {
  local expected="$1"; shift
  local actual
  actual="$(status "$@")"
  if [ "$actual" = "$expected" ]; then ok "HTTP $expected"; else bad "期望 HTTP $expected，实际 $actual：$(cat "$BODY_FILE")"; fi
}
login() {
  curl -sf -X POST "$BASE/auth/mock" -H 'content-type: application/json' \
    -d "{\"userId\":\"$1\"}" | jq -r .token
}
auth() { printf 'authorization: Bearer %s' "$1"; }

wait_http() {
  local url="$1" tries=60
  for _ in $(seq 1 "$tries"); do
    if curl -s -o /dev/null -w '%{http_code}' "$url" | grep -q '^200$'; then return 0; fi
    sleep 0.25
  done
  return 1
}

echo "== 启动测试桩与临时服务端 =="
MOCK_PORT="$MOCK_PORT" node tests/mock-integrations.mjs >"$TMP_DIR/mock.log" 2>&1 &
MOCK_PID=$!
APP_ENV=development PORT="$PORT" DATABASE_PATH="$TMP_DIR/workbench.db" \
  DINGTALK_CLIENT_ID=test-client DINGTALK_CLIENT_SECRET=test-secret \
  DINGTALK_AGENT_ID=123 DINGTALK_WORK_NOTIFY=1 DINGTALK_API_BASE="$MOCK" \
  GITLAB_BASE_URL="$MOCK" GITLAB_TOKEN=test-gitlab-token \
  GITLAB_WEBHOOK_SECRET=test-hook-secret \
  "$BIN" >"$TMP_DIR/server.log" 2>&1 &
SERVER_PID=$!
wait_http "$MOCK/__requests" && ok "mock 已启动"
wait_http "$BASE/health" && ok "临时服务端已启动" || { cat "$TMP_DIR/server.log"; exit 1; }

TA="$(login admin)"
TZ="$(login zhangsan)"
TL="$(login lisi)"
TD="$(login zhaoliu)"
check "测试账号已登录" "$([ -n "$TA" ] && echo yes)" "yes"

echo "== 钉钉组织同步 =="
expect 200 -X POST "$BASE/admin/dingtalk/sync" -H "$(auth "$TA")" \
  -H 'content-type: application/json' -d '{"disableMissing":false}'
check "同步创建 3 个成员" "$(jq -r .created "$BODY_FILE")" "3"
check "同步 2 个部门" "$(jq -r .departments "$BODY_FILE")" "2"
SYNCED="$(curl -s "$BASE/state" -H "$(auth "$TA")" | jq -r '.users[] | select(.name=="钉钉负责人") | .id')"
check "钉钉成员落库" "$([ -n "$SYNCED" ] && echo yes)" "yes"
expect 200 -X POST "$BASE/admin/users/$SYNCED" -H "$(auth "$TA")" \
  -H 'content-type: application/json' -d '{"roles":["lead"]}'
check "同步成员可分配负责人角色" "$(jq -r '.user.roles[0]' "$BODY_FILE")" "lead"

echo "== 创建需求并触发钉钉工作通知 =="
expect 201 -X POST "$BASE/requirements" -H "$(auth "$TL")" \
  -H 'content-type: application/json' -d '{"title":"集成测试需求"}'
RID="$(jq -r .requirement.id "$BODY_FILE")"
expect 200 -X POST "$BASE/requirements/$RID/sessions" -H "$(auth "$TL")" \
  -H 'content-type: application/json' -d '{"type":"requirement","label":"集成测试"}'
SID="$(jq -r .session.id "$BODY_FILE")"
expect 200 -X POST "$BASE/requirements/$RID/bind" -H "$(auth "$TL")" \
  -H 'content-type: application/json' -d "{\"sessionRecordId\":\"$SID\"}"
expect 200 -X POST "$BASE/requirements/$RID/submit" -H "$(auth "$TL")" \
  -H 'content-type: application/json' -d '{"summary":"集成测试提交"}'
expect 200 -X POST "$BASE/requirements/$RID/reviewers" -H "$(auth "$TZ")" \
  -H 'content-type: application/json' -d "{\"userIds\":[\"$SYNCED\",\"zhangsan\"]}"
sleep 1
NOTICE_COUNT="$(curl -s "$MOCK/__requests" | jq '[.[] | select(.path=="/topapi/message/corpconversation/asyncsend_v2")] | length')"
check "钉钉工作通知已发送" "$NOTICE_COUNT" "1"
NOTICE_USER="$(curl -s "$MOCK/__requests" | jq -r '[.[] | select(.path=="/topapi/message/corpconversation/asyncsend_v2")][0].body.userid_list')"
check "工作通知发给钉钉 userid" "$NOTICE_USER" "mock-lead-1"

echo "== 会签与排期 =="
TS="$(login "$SYNCED")"
expect 200 -X POST "$BASE/requirements/$RID/review" -H "$(auth "$TS")" \
  -H 'content-type: application/json' -d '{"decision":"approve","comment":"钉钉会签通过"}'
expect 200 -X POST "$BASE/requirements/$RID/review" -H "$(auth "$TZ")" \
  -H 'content-type: application/json' -d '{"decision":"approve","comment":"第二位通过"}'
check "全部会签通过" "$(jq -r .requirement.status "$BODY_FILE")" "approved"
check "通过后纳入本期" "$(jq -r .requirement.inScope "$BODY_FILE")" "true"
expect 200 -X POST "$BASE/requirements/$RID/schedule" -H "$(auth "$TZ")" \
  -H 'content-type: application/json' -d '{"startDate":"2026-11-24","endDate":"2026-11-28"}'

echo "== GitLab 分支 / MR / 流水线 =="
expect 200 -X POST "$BASE/platforms/trade-server" -H "$(auth "$TA")" \
  -H 'content-type: application/json' -d '{"name":"交易服务端","shortName":"交易","groupId":"server","gitlabProjectId":"123"}'
expect 200 -X POST "$BASE/requirements/$RID/dev-assign" -H "$(auth "$TZ")" \
  -H 'content-type: application/json' -d '{"platformId":"trade-server","assigneeId":"zhaoliu"}'
expect 200 -X POST "$BASE/requirements/$RID/dev-start" -H "$(auth "$TD")" \
  -H 'content-type: application/json' -d '{"platformId":"trade-server"}'
BRANCH="$(jq -r '.requirement.devTasks[] | select(.platformId=="trade-server") | .branch' "$BODY_FILE")"
check "开始开发返回分支（响应已刷新）" "$BRANCH" "feature/$(jq -r .requirement.code "$BODY_FILE" | tr 'A-Z' 'a-z')-trade-server"
expect 200 -X POST "$BASE/requirements/$RID/dev-finish" -H "$(auth "$TD")" \
  -H 'content-type: application/json' -d '{"platformId":"trade-server"}'
MR_URL="$(jq -r '.requirement.devTasks[] | select(.platformId=="trade-server") | .mrUrl' "$BODY_FILE")"
case "$MR_URL" in
  http://gitlab.mock/*) ok "dev-finish 返回 mock MR 地址" ;;
  *) bad "dev-finish MR 地址不正确：$MR_URL" ;;
esac
PIPE_STATUS="$(jq -r '.requirement.devTasks[] | select(.platformId=="trade-server") | .pipelineStatus' "$BODY_FILE")"
check "dev-finish 查询流水线" "$PIPE_STATUS" "success"
BRANCH_CALLS="$(curl -s "$MOCK/__requests" | jq '[.[] | select(.path=="/api/v4/projects/123/repository/branches")] | length')"
check "GitLab 创建分支已调用" "$BRANCH_CALLS" "1"
MR_CALLS="$(curl -s "$MOCK/__requests" | jq '[.[] | select(.path=="/api/v4/projects/123/merge_requests")] | length')"
check "GitLab 创建 MR 已调用" "$MR_CALLS" "1"
expect 200 -X POST "$BASE/webhooks/gitlab" -H 'content-type: application/json' \
  -H 'x-gitlab-token: test-hook-secret' \
  -d "{\"object_kind\":\"pipeline\",\"object_attributes\":{\"ref\":\"$BRANCH\",\"status\":\"failed\",\"url\":\"http://gitlab.mock/pipelines/99\"}}"
check "Webhook 命中开发任务" "$(jq -r .updated "$BODY_FILE")" "true"
WEBHOOK_STATUS="$(curl -s "$BASE/state" -H "$(auth "$TA")" | jq -r --arg rid "$RID" '.requirements[] | select(.id==$rid) | .devTasks[] | select(.platformId=="trade-server") | .pipelineStatus')"
check "Webhook 回写流水线状态" "$WEBHOOK_STATUS" "failed"
expect 401 -X POST "$BASE/webhooks/gitlab" -H 'content-type: application/json' \
  -H 'x-gitlab-token: wrong-secret' -d '{"object_kind":"pipeline","object_attributes":{"ref":"x","status":"failed"}}'

echo
if [ "$fail" -gt 0 ]; then
  echo "集成测试失败：$pass 项通过，$fail 项失败"
  exit 1
fi
echo "集成测试全部通过（$pass 项）"
