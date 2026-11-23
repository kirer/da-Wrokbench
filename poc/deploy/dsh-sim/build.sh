#!/usr/bin/env bash
# 在 kiri Docker 上构建 headless DSH 工作台镜像。
# 用法：bash deploy/dsh-sim/build.sh [docker-context] [tag]
# 可用环境变量覆盖：APT_MIRROR（默认阿里云）、NPM_REGISTRY（默认华为云 npm 镜像；
# 官方源在 kiri 内只有几十 KB/s，npmmirror 的部分 CDN 地址会连接超时）、
# DSH_VERSION、PNPM_VERSION。
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTEXT="${1:-kiri}"
TAG="${2:-dsh-workbench-sim:0.1.0}"
APT_MIRROR="${APT_MIRROR:-mirrors.aliyun.com}"
NPM_REGISTRY="${NPM_REGISTRY:-https://mirrors.huaweicloud.com/repository/npm/}"
DSH_VERSION="${DSH_VERSION:-0.2.2-rc.5}"
PNPM_VERSION="${PNPM_VERSION:-11.28.5}"
docker --context "$CONTEXT" build \
  -f "$ROOT_DIR/deploy/dsh-sim/Dockerfile" \
  --build-arg "APT_MIRROR=$APT_MIRROR" \
  --build-arg "NPM_REGISTRY=$NPM_REGISTRY" \
  --build-arg "DSH_VERSION=$DSH_VERSION" \
  --build-arg "PNPM_VERSION=$PNPM_VERSION" \
  -t "$TAG" "$ROOT_DIR"
echo "已构建 $TAG（context=$CONTEXT）"
