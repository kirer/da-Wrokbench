#!/usr/bin/env bash
# 生成仓库根目录的 .env：随机 Postgres 密码、JWT 密钥和内部令牌，权限 600。
# 用法：bash deploy/init-env.sh [目标文件]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT_DIR/.env}"

if [ -e "$DEST" ]; then
  echo "已存在 $DEST，未覆盖；如需重新生成请先删除。" >&2
  exit 1
fi

umask 077
rand() { openssl rand -hex 32; }

cat >"$DEST" <<EOF
# 由 deploy/init-env.sh 生成；包含密钥，不要提交到仓库。
APP_ENV=development
WORKBENCH_PORT=3210

POSTGRES_PASSWORD=$(rand)

WORKBENCH_AUTH_PROVIDER=mock
WORKBENCH_AUTH_SECRET=$(rand)
WORKBENCH_INTERNAL_TOKEN=$(rand)

WORKBENCH_PUBLIC_URL=
WORKBENCH_ALLOWED_ORIGINS=
WORKBENCH_COOKIE_SECURE=

DINGTALK_CLIENT_ID=
DINGTALK_CLIENT_SECRET=
DINGTALK_AGENT_ID=
DINGTALK_WORK_NOTIFY=0
DINGTALK_API_BASE=https://oapi.dingtalk.com
DINGTALK_DEFAULT_ROLES=dev
DINGTALK_SYNC_ROOT_DEPT=1
DINGTALK_SYNC_DISABLE_MISSING=0

GITLAB_BASE_URL=
GITLAB_TOKEN=
GITLAB_WEBHOOK_SECRET=
GITLAB_DEFAULT_BRANCH=main

RUST_LOG=dsh_workbench_server=info,tower_http=info
EOF
chmod 600 "$DEST"
echo "已生成 $DEST（权限 600），包含随机数据库密码、JWT 密钥和内部令牌。"
echo "开发演示可直接 docker compose up -d --build；生产请设置 APP_ENV=production、WORKBENCH_AUTH_PROVIDER=dingtalk 并配置钉钉凭据。"
echo "DSH 宿主启动时从 .env 读取 WORKBENCH_INTERNAL_TOKEN，不要把令牌打印到终端或日志。"
