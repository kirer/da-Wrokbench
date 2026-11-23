#!/usr/bin/env bash
# 真实 GitLab 集成验证：分支、提交、流水线、MR、Webhook。
# 前置：deploy/gitlab 已启动并完成 bootstrap；Rust 服务端已配置 GITLAB_*；
#       Runner 在线。该脚本会创建一条测试需求，请在测试环境运行。
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3210}"
GITLAB_URL="${GITLAB_URL:-http://127.0.0.1:8929}"
GITLAB_TOKEN="${WORKBENCH_GITLAB_TOKEN:?请设置 WORKBENCH_GITLAB_TOKEN}"
GITLAB_PROJECT_PATH="${GITLAB_PROJECT_PATH:-workbench/trade-server}"
PLATFORM_ID="${GITLAB_PLATFORM_ID:-trade-server}"
WEBHOOK_SECRET="${GITLAB_WEBHOOK_SECRET:-}"

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
pass=0
fail=0

ok() { pass=$((pass + 1)); printf '  ✓ %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  ✗ %s\n' "$1" >&2; }
status() { curl -s -o "$BODY_FILE" -w '%{http_code}' "$@"; }

expect() {
  local expected="$1"; shift
  local actual
  actual="$(status "$@")"
  if [ "$actual" = "$expected" ]; then
    ok "HTTP $expected"
  else
    bad "期望 HTTP $expected，实际 $actual：$(cat "$BODY_FILE")"
    return 1
  fi
}

login() {
  curl -sf -X POST "$BASE/auth/mock" -H 'content-type: application/json' \
    -d "{\"userId\":\"$1\"}" | jq -r .token
}
auth() { printf 'authorization: Bearer %s' "$1"; }
encode() { jq -rn --arg v "$1" '$v|@uri'; }

gl() {
  curl -sf -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$@"
}
PROJECT_ENC="$(encode "$GITLAB_PROJECT_PATH")"

echo "== 登录与平台配置 =="
T_LISI="$(login lisi)"
T_ZS="$(login zhangsan)"
T_DEV="$(login zhaoliu)"
expect 200 -X POST "$BASE/platforms/$PLATFORM_ID" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' \
  -d "{\"gitlabProjectPath\":\"$GITLAB_PROJECT_PATH\"}"
ok "平台 $PLATFORM_ID 指向 $GITLAB_PROJECT_PATH"
expect 200 -X POST "$BASE/iterations/iteration-2026-s11/select" -H "$(auth "$T_LISI")"

echo "== 创建需求并推进到开发 =="
TITLE="真实 GitLab 验证 $(date +%H%M%S)"
expect 201 -X POST "$BASE/requirements" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d "{\"title\":\"$TITLE\"}"
REQ_ID="$(jq -r .requirement.id "$BODY_FILE")"
REQ_CODE="$(jq -r .requirement.code "$BODY_FILE")"
expect 200 -X POST "$BASE/requirements/$REQ_ID/sessions" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"type":"requirement","label":"真实 GitLab 验证"}'
SESSION="$(jq -r .session.id "$BODY_FILE")"
expect 200 -X POST "$BASE/requirements/$REQ_ID/bind" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d "{\"sessionRecordId\":\"$SESSION\"}"
expect 200 -X POST "$BASE/requirements/$REQ_ID/submit" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"summary":"真实 GitLab 验证"}'
expect 200 -X POST "$BASE/requirements/$REQ_ID/review" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"decision":"approve","comment":"真实 GitLab 验证"}'
expect 200 -X POST "$BASE/requirements/$REQ_ID/schedule" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"startDate":"2026-11-23","endDate":"2026-11-28"}'
expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-assign" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d "{\"platformId\":\"$PLATFORM_ID\",\"assigneeId\":\"zhaoliu\"}"
expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-start" -H "$(auth "$T_DEV")" \
  -H 'content-type: application/json' -d "{\"platformId\":\"$PLATFORM_ID\"}"
BRANCH="$(jq -r --arg p "$PLATFORM_ID" '.requirement.devTasks[] | select(.platformId==$p) | .branch // empty' "$BODY_FILE")"
[ -n "$BRANCH" ] && ok "dev-start 返回分支：$BRANCH" || { bad "dev-start 未返回分支"; exit 1; }
BRANCH_ENC="$(encode "$BRANCH")"

echo "== 真实 GitLab 分支与提交 =="
if gl "$GITLAB_URL/api/v4/projects/$PROJECT_ENC/repository/branches/$BRANCH_ENC" | jq -e .name >/dev/null; then
  ok "GitLab 分支确实存在"
else
  bad "GitLab 中找不到分支 $BRANCH"
  exit 1
fi

COMMIT_SHA="$(gl -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ENC/repository/commits" \
  --data-urlencode "branch=$BRANCH" \
  --data-urlencode "commit_message=feat: $REQ_CODE workbench integration" \
  --data-urlencode 'actions[][action]=create' \
  --data-urlencode "actions[][file_path]=.workbench/$REQ_CODE.md" \
  --data-urlencode "actions[][content]=requirement: $REQ_CODE\nsource: dsh-workbench\n" | jq -r .id)"
[ -n "$COMMIT_SHA" ] && [ "$COMMIT_SHA" != "null" ] && ok "已模拟开发提交：${COMMIT_SHA:0:8}" || { bad "提交失败"; exit 1; }

echo "== 等待流水线 =="
PIPELINE_STATUS=""
PIPELINE_ID=""
for _ in $(seq 1 60); do
  PIPELINE="$(gl "$GITLAB_URL/api/v4/projects/$PROJECT_ENC/pipelines?ref=$BRANCH_ENC&per_page=1" | jq -c '.[0] // empty')"
  PIPELINE_STATUS="$(echo "$PIPELINE" | jq -r '.status // empty')"
  PIPELINE_ID="$(echo "$PIPELINE" | jq -r '.id // empty')"
  [ "$PIPELINE_STATUS" = "success" ] && break
  sleep 3
done
if [ "$PIPELINE_STATUS" = "success" ]; then
  ok "流水线 #$PIPELINE_ID 成功"
else
  bad "流水线未成功（status=${PIPELINE_STATUS:-none}）"
fi

echo "== 完成开发与 MR =="
expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-finish" -H "$(auth "$T_DEV")" \
  -H 'content-type: application/json' -d "{\"platformId\":\"$PLATFORM_ID\",\"note\":\"真实 GitLab 验证\"}"
MR_URL="$(jq -r --arg p "$PLATFORM_ID" '.requirement.devTasks[] | select(.platformId==$p) | .mrUrl // empty' "$BODY_FILE")"
case "$MR_URL" in
  "$GITLAB_URL"*) ok "MR 地址来自真实 GitLab：$MR_URL" ;;
  *) bad "MR 地址不是真实 GitLab：$MR_URL" ;;
esac
jq -e --arg p "$PLATFORM_ID" '.requirement.devTasks[] | select(.platformId==$p) | .pipelineStatus=="success"' "$BODY_FILE" >/dev/null \
  && ok "dev-finish 回写流水线成功" || bad "dev-finish 未回写流水线成功"

MR_IID="$(gl "$GITLAB_URL/api/v4/projects/$PROJECT_ENC/merge_requests?state=opened&source_branch=$BRANCH_ENC" | jq -r '.[0].iid // empty')"
[ -n "$MR_IID" ] && ok "GitLab 中存在打开的 MR !$MR_IID" || bad "GitLab 中找不到 MR"

if [ -n "$WEBHOOK_SECRET" ]; then
  echo "== Webhook 回写 =="
  BEFORE_URL="$(jq -r --arg p "$PLATFORM_ID" '.requirement.devTasks[] | select(.platformId==$p) | .pipelineUrl // empty' "$BODY_FILE")"
  gl -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ENC/repository/commits" \
    --data-urlencode "branch=$BRANCH" \
    --data-urlencode 'commit_message=chore: webhook verification' \
    --data-urlencode 'actions[][action]=create' \
    --data-urlencode 'actions[][file_path]=.workbench/webhook.txt' \
    --data-urlencode "actions[][content]=webhook $(date +%s)\n" >/dev/null
  AFTER_URL=""
  for _ in $(seq 1 40); do
    curl -sf "$BASE/state" -H "$(auth "$T_DEV")" > "$BODY_FILE" || true
    AFTER_URL="$(jq -r --arg id "$REQ_ID" --arg p "$PLATFORM_ID" '.requirements[] | select(.id==$id) | .devTasks[] | select(.platformId==$p) | .pipelineUrl // empty' "$BODY_FILE" 2>/dev/null || true)"
    if [ -n "$AFTER_URL" ] && [ "$AFTER_URL" != "$BEFORE_URL" ]; then break; fi
    sleep 3
  done
  if [ -n "$AFTER_URL" ] && [ "$AFTER_URL" != "$BEFORE_URL" ]; then
    ok "Webhook 把新流水线回写到工作台：$AFTER_URL"
  else
    bad "Webhook 未回写新流水线（before=$BEFORE_URL after=$AFTER_URL）"
  fi
else
  echo "  （未设置 GITLAB_WEBHOOK_SECRET，跳过 Webhook 回写验证）"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "失败 $fail 项，通过 $pass 项" >&2
  exit 1
fi
echo "真实 GitLab 集成全部通过（$pass 项）：需求 $REQ_CODE"
