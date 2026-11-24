#!/usr/bin/env bash
# 初始化本地 GitLab：机器人账号、项目、CI 文件、Runner、Webhook。
# 依赖：curl、jq、openssl、docker。GitLab 容器已启动并完成首次初始化。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${GITLAB_ENV_FILE:-$ROOT_DIR/.local/gitlab.env}"
OUT_FILE="${GITLAB_OUT_FILE:-$ROOT_DIR/.local/gitlab.outputs.env}"
BASE="${GITLAB_URL:-http://127.0.0.1:8929}"
HOOK_URL="${GITLAB_WEBHOOK_URL:-http://host.docker.internal:3210/webhooks/gitlab}"
PROJECTS="${GITLAB_PROJECTS:-trade-server web}"

if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 $ENV_FILE；先复制 gitlab.env.example 并设置 GITLAB_ROOT_PASSWORD" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${GITLAB_ROOT_PASSWORD:?GITLAB_ROOT_PASSWORD 未设置}"
: "${GITLAB_WEBHOOK_SECRET:?GITLAB_WEBHOOK_SECRET 未设置；用 openssl rand -hex 32 生成}"
if [ "$GITLAB_WEBHOOK_SECRET" = "change-me-to-a-random-webhook-secret" ]; then
  echo "GITLAB_WEBHOOK_SECRET 仍是示例占位值，请换成随机值" >&2
  exit 1
fi
WEBHOOK_SECRET="$GITLAB_WEBHOOK_SECRET"
BOT_USER="${GITLAB_BOT_USER:-workbench-bot}"

api() {
  curl -sS --fail-with-body "$@"
}

echo "== 等待 GitLab =="
# GitLab 的 /-/readiness 默认只允许容器内 127.0.0.1 访问；从宿主机用登录页判断。
for _ in $(seq 1 240); do
  if curl -fsS -m 3 "$BASE/users/sign_in" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
curl -fsS -m 5 "$BASE/users/sign_in" >/dev/null
echo "GitLab 就绪：$BASE"

echo "== 获取 root OAuth token =="
ROOT_TOKEN="$(api -X POST "$BASE/oauth/token" \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'username=root' \
  --data-urlencode "password=$GITLAB_ROOT_PASSWORD" \
  --data-urlencode 'scope=api' | jq -r .access_token)"
if [ -z "$ROOT_TOKEN" ] || [ "$ROOT_TOKEN" = "null" ]; then
  echo "root OAuth token 获取失败" >&2
  exit 1
fi
AUTH_ROOT=(-H "Authorization: Bearer $ROOT_TOKEN")

echo "== 机器人账号 $BOT_USER =="
USER_ID="$(api "${AUTH_ROOT[@]}" "$BASE/api/v4/users?username=$BOT_USER" | jq -r '.[0].id // empty')"
if [ -z "$USER_ID" ]; then
  USER_ID="$(api -X POST "$BASE/api/v4/users" "${AUTH_ROOT[@]}" \
    --data-urlencode "username=$BOT_USER" \
    --data-urlencode "name=Workbench Bot" \
    --data-urlencode "email=$BOT_USER@example.com" \
    --data-urlencode "password=$(openssl rand -base64 24 | tr -d '/+=')" \
    --data-urlencode 'skip_confirmation=true' | jq -r .id)"
fi
[ -n "$USER_ID" ] && [ "$USER_ID" != "null" ] || { echo "机器人账号创建失败" >&2; exit 1; }
echo "用户 ID：$USER_ID"

echo "== 机器人 Token =="
# 撤销旧的同名 impersonation token，避免无限累积。
EXISTING_TOKENS="$(api "${AUTH_ROOT[@]}" "$BASE/api/v4/users/$USER_ID/impersonation_tokens" | jq -r '.[] | select(.name=="workbench-poc") | .id')"
for token_id in $EXISTING_TOKENS; do
  api -X DELETE "$BASE/api/v4/users/$USER_ID/impersonation_tokens/$token_id" "${AUTH_ROOT[@]}" >/dev/null || true
done
EXPIRES_AT="$(date -u -v+300d +%Y-%m-%d 2>/dev/null || date -u -d '+300 days' +%Y-%m-%d)"
BOT_TOKEN="$(api -X POST "$BASE/api/v4/users/$USER_ID/impersonation_tokens" "${AUTH_ROOT[@]}" \
  --data-urlencode 'name=workbench-poc' \
  --data-urlencode 'scopes[]=api' \
  --data-urlencode "expires_at=$EXPIRES_AT" | jq -r .token)"
if [ -z "$BOT_TOKEN" ] || [ "$BOT_TOKEN" = "null" ]; then
  echo "机器人 Token 创建失败" >&2
  exit 1
fi
AUTH=(-H "PRIVATE-TOKEN: $BOT_TOKEN")
api "${AUTH[@]}" "$BASE/api/v4/user" | jq -e '.username' >/dev/null
echo "机器人 Token 已写入（不打印）"

echo "== 分组与项目 =="
GROUP_ID="$(api "${AUTH[@]}" "$BASE/api/v4/groups?search=workbench" | jq -r '.[] | select(.path=="workbench") | .id' | head -1)"
if [ -z "$GROUP_ID" ]; then
  GROUP_ID="$(api -X POST "$BASE/api/v4/groups" "${AUTH[@]}" \
    --data-urlencode 'name=Workbench' \
    --data-urlencode 'path=workbench' \
    --data-urlencode 'visibility=private' | jq -r .id)"
fi
echo "分组 ID：$GROUP_ID"
for project in $PROJECTS; do
  PROJECT_ID="$(api "${AUTH[@]}" "$BASE/api/v4/projects/workbench%2F$project" 2>/dev/null | jq -r .id 2>/dev/null || true)"
  if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    PROJECT_ID="$(api -X POST "$BASE/api/v4/projects" "${AUTH[@]}" \
      --data-urlencode "name=$project" \
      --data-urlencode "path=$project" \
      --data-urlencode "namespace_id=$GROUP_ID" \
      --data-urlencode 'initialize_with_readme=true' \
      --data-urlencode 'visibility=private' | jq -r .id)"
    sleep 2
    api -X PUT "$BASE/api/v4/projects/$PROJECT_ID" "${AUTH[@]}" \
      --data-urlencode 'default_branch=main' >/dev/null || true
  fi
  [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ] || { echo "项目 $project 创建失败" >&2; exit 1; }
  echo "$project：id=$PROJECT_ID"

  # 项目里放一个最小 CI，保证分支提交能产生流水线。
  CI_FILE="$(api "${AUTH[@]}" "$BASE/api/v4/projects/$PROJECT_ID/repository/files/.gitlab-ci.yml?ref=main" 2>/dev/null | jq -r .file_path 2>/dev/null || true)"
  if [ -z "$CI_FILE" ] || [ "$CI_FILE" = "null" ]; then
    api -X POST "$BASE/api/v4/projects/$PROJECT_ID/repository/commits" "${AUTH[@]}" \
      --data-urlencode 'branch=main' \
      --data-urlencode 'commit_message=chore: add workbench CI' \
      --data-urlencode 'actions[][action]=create' \
      --data-urlencode 'actions[][file_path]=.gitlab-ci.yml' \
      --data-urlencode $'actions[][content]=stages:\n  - test\n\nworkbench-smoke:\n  stage: test\n  tags:\n    - workbench\n  script:\n    - echo "workbench pipeline ok"\n' >/dev/null
  fi

  # Webhook：GitLab 容器通过 host.docker.internal 访问宿主机工作台服务端。
  HOOKS="$(api "${AUTH[@]}" "$BASE/api/v4/projects/$PROJECT_ID/hooks")"
  HOOK_ID="$(echo "$HOOKS" | jq -r --arg url "$HOOK_URL" '.[] | select(.url==$url) | .id' | head -1)"
  if [ -n "$HOOK_ID" ]; then
    api -X PUT "$BASE/api/v4/projects/$PROJECT_ID/hooks/$HOOK_ID" "${AUTH[@]}" \
      --data-urlencode "url=$HOOK_URL" \
      --data-urlencode "token=$WEBHOOK_SECRET" \
      --data-urlencode 'pipeline_events=true' \
      --data-urlencode 'merge_requests_events=true' \
      --data-urlencode 'push_events=false' \
      --data-urlencode 'enable_ssl_verification=false' >/dev/null
  else
    api -X POST "$BASE/api/v4/projects/$PROJECT_ID/hooks" "${AUTH[@]}" \
      --data-urlencode "url=$HOOK_URL" \
      --data-urlencode "token=$WEBHOOK_SECRET" \
      --data-urlencode 'pipeline_events=true' \
      --data-urlencode 'merge_requests_events=true' \
      --data-urlencode 'push_events=false' \
      --data-urlencode 'enable_ssl_verification=false' >/dev/null
  fi
done

echo "== Group Runner =="
RUNNER_TOKEN="$(api -X POST "$BASE/api/v4/user/runners" "${AUTH[@]}" \
  --data-urlencode 'runner_type=group_type' \
  --data-urlencode "group_id=$GROUP_ID" \
  --data-urlencode 'description=dsh-workbench-runner' \
  --data-urlencode 'tag_list=workbench' \
  --data-urlencode 'run_untagged=true' | jq -r .token)"
[ -n "$RUNNER_TOKEN" ] && [ "$RUNNER_TOKEN" != "null" ] || { echo "Runner 创建失败" >&2; exit 1; }

mkdir -p "$(dirname "$OUT_FILE")"
chmod 700 "$(dirname "$OUT_FILE")"
umask 077
cat > "$OUT_FILE" <<EOF
# 由 deploy/gitlab/bootstrap.sh 生成，含敏感凭据，不要提交。
GITLAB_URL=$BASE
GITLAB_BOT_USER=$BOT_USER
WORKBENCH_GITLAB_TOKEN=$BOT_TOKEN
GITLAB_WEBHOOK_SECRET=$WEBHOOK_SECRET
RUNNER_TOKEN=$RUNNER_TOKEN
GITLAB_PROJECT_TRADE=workbench/trade-server
GITLAB_PROJECT_WEB=workbench/web
EOF
chmod 600 "$OUT_FILE"

echo
echo "初始化完成。凭据写入：$OUT_FILE"
echo "下一步：把 RUNNER_TOKEN 追加到 $ENV_FILE，然后："
echo "  docker compose --env-file $ENV_FILE up -d runner"
