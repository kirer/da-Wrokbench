# Headless DSH worker with the workbench plugin, used for multi-role simulation.
# Build context: 仓库根目录（见 deploy/dsh-sim/build.sh）。
FROM node:24-bookworm-slim

ARG DSH_VERSION=0.2.2-rc.5
ARG PNPM_VERSION=11.28.5
# 可选：构建机到官方源很慢时换成就近镜像（build.sh 在 kiri 上默认使用阿里云/华为云）。
ARG APT_MIRROR=
ARG NPM_REGISTRY=

RUN if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|deb.debian.org|${APT_MIRROR#*://}|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/* \
    && if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm install -g --no-audit --no-fund "@deepseek-ai/dsh@${DSH_VERSION}" "pnpm@${PNPM_VERSION}" \
    && npm cache clean --force

WORKDIR /opt/dsh-workbench
COPY package.json cordis.patch.yml index.js client.js client.design-studio.js ./
COPY design-studio ./design-studio

ENV DSH_HOME=/home/node/.dsh \
    WORKBENCH_SERVER_URL=http://host.docker.internal:3210 \
    DSH_WORKBENCH_BASE=/workbench/default \
    MAGPIE_GATEWAY_KEY=local \
    NODE_ENV=development

RUN mkdir -p /home/node/.dsh /workbench \
    && chown -R node:node /home/node /workbench /opt/dsh-workbench

USER node
# profile 初始化与 plugin add 由 pnpm/npm 完成，同样要走镜像源。
RUN if [ -n "$NPM_REGISTRY" ]; then printf 'registry=%s\n' "$NPM_REGISTRY" > /home/node/.npmrc; fi \
    && dsh --profile workbench-sim --from-default-profile headless --dump-config >/dev/null \
    && dsh plugin --profile workbench-sim add /opt/dsh-workbench

COPY --chown=node:node deploy/dsh-sim/cordis.patch.yml /home/node/.dsh/profiles/workbench-sim/cordis.patch.yml

WORKDIR /workbench
CMD ["sh", "-c", "mkdir -p \"$DSH_WORKBENCH_BASE\" && exec sleep infinity"]
