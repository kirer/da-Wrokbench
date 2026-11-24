# 本地 GitLab（真实集成验证）

用于验证工作台的真实 GitLab 集成：分支、MR、流水线、Webhook。GitLab CE 和 Runner
都跑在 Docker 里，数据和凭据保存在本机；钉钉仍留空。

## 资源

- GitLab CE 17.11.4，端口 `8929`（网页/API）和 `2224`（SSH）
- GitLab Runner 17.11.0，Docker executor
- 约 3–4 GB 内存、3 GB 磁盘；首次启动需要 3–8 分钟
- 数据卷：`gitlab-config`、`gitlab-logs`、`gitlab-data`、`gitlab-runner-config`

## 首次启动

```bash
cd poc
mkdir -p .local
# 用随机值替换示例占位值
sed -e "s|^GITLAB_ROOT_PASSWORD=.*|GITLAB_ROOT_PASSWORD=$(openssl rand -hex 24)|" \
    -e "s|^GITLAB_WEBHOOK_SECRET=.*|GITLAB_WEBHOOK_SECRET=$(openssl rand -hex 32)|" \
    deploy/gitlab/gitlab.env.example >.local/gitlab.env
chmod 600 .local/gitlab.env

docker compose -f deploy/gitlab/docker-compose.yml --env-file .local/gitlab.env up -d gitlab
```

等 GitLab 就绪（`/-/readiness` 默认只允许容器内访问）：

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8929/users/sign_in
docker exec dsh-gitlab curl -fsS http://127.0.0.1:8929/-/readiness
```

浏览器打开 `http://127.0.0.1:8929`，用户名 `root`，密码是 `.local/gitlab.env` 里的
`GITLAB_ROOT_PASSWORD`。

如果 Docker Hub 拉取超时，可以用镜像站拉取后打回官方 tag：

```bash
docker pull docker.m.daocloud.io/gitlab/gitlab-ce:17.11.4-ce.0
docker tag docker.m.daocloud.io/gitlab/gitlab-ce:17.11.4-ce.0 gitlab/gitlab-ce:17.11.4-ce.0
docker pull docker.m.daocloud.io/gitlab/gitlab-runner:v17.11.0
docker tag docker.m.daocloud.io/gitlab/gitlab-runner:v17.11.0 gitlab/gitlab-runner:v17.11.0
```

## 初始化账号、项目、Runner、Webhook

```bash
bash deploy/gitlab/bootstrap.sh
```

脚本会：

1. 等 GitLab ready，用 root 密码换 OAuth token。
2. 创建机器人账号 `workbench-bot` 和 `api` 权限的 impersonation token。
3. 创建私有分组 `workbench` 和项目 `trade-server`、`web`，写入最小 `.gitlab-ci.yml`。
4. 创建 Group Runner，带 `workbench` tag。
5. 给两个项目配置 Webhook，指向宿主机
   `http://host.docker.internal:3210/webhooks/gitlab`。
6. 把机器人 token、Runner token、项目路径写入 `.local/gitlab.outputs.env`（600 权限）。

把 Runner token 追加到 `.local/gitlab.env` 后启动 Runner：

```bash
set -a; . .local/gitlab.outputs.env; set +a
grep -v '^RUNNER_TOKEN=' .local/gitlab.env > .local/gitlab.env.tmp
mv .local/gitlab.env.tmp .local/gitlab.env
chmod 600 .local/gitlab.env
printf 'RUNNER_TOKEN=%s\n' "$RUNNER_TOKEN" >> .local/gitlab.env
docker compose -f deploy/gitlab/docker-compose.yml --env-file .local/gitlab.env up -d runner
```

检查 Runner：

```bash
docker exec dsh-gitlab-runner gitlab-runner list
docker exec dsh-gitlab-runner gitlab-runner verify
```

## 接到工作台服务端

用 bootstrap 输出的值重启 Rust 服务端（在 `poc/` 下执行）：

```bash
set -a; . .local/gitlab.outputs.env; set +a
GITLAB_BASE_URL="$GITLAB_URL" \
GITLAB_TOKEN="$WORKBENCH_GITLAB_TOKEN" \
GITLAB_WEBHOOK_SECRET="$GITLAB_WEBHOOK_SECRET" \
GITLAB_DEFAULT_BRANCH=main \
./server/target/debug/dsh-workbench-server
```

**变量名不要写错**：`.local/gitlab.outputs.env` 里 webhook 密钥叫
`GITLAB_WEBHOOK_SECRET`，不是 `WORKBENCH_GITLAB_WEBHOOK_SECRET`。写成不存在的
变量会展开成空串，服务端照样启动（空密钥只在生产环境才 panic），但
`webhook_authorized()` 对任何 token 都返回 false —— GitLab 的每次 Webhook
都吃 401，流水线和 MR 状态永远不会回写，而且界面上看不出原因。

启动后确认一次，两个断言都要过：

```bash
set -a; . .local/gitlab.outputs.env; set +a
# 1) 正确密钥 -> 200；错误密钥 -> 401
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3210/webhooks/gitlab \
  -H "x-gitlab-token: $GITLAB_WEBHOOK_SECRET" -H 'content-type: application/json' \
  -d '{"object_kind":"pipeline"}'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3210/webhooks/gitlab \
  -H 'x-gitlab-token: wrong' -H 'content-type: application/json' -d '{"object_kind":"pipeline"}'

# 2) 管理端应报 gitlab.webhookConfigured = true
TOKEN="$(curl -sS -X POST http://127.0.0.1:3210/auth/mock \
  -H 'content-type: application/json' -d '{"userId":"admin"}' | jq -r .token)"
curl -sS http://127.0.0.1:3210/admin/integrations \
  -H "authorization: Bearer $TOKEN" | jq .gitlab
```

然后在工作台「平台配置」里给平台填 GitLab 项目路径：

- 交易服务端：`workbench/trade-server`
- 前端 Web：`workbench/web`

也可以直接调 API：

```bash
TOKEN=... # 负责人或管理员登录 token
curl -sS -X POST http://127.0.0.1:3210/platforms/trade-server \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"gitlab_project_path":"workbench/trade-server"}'
```

## 真实链路验证

1. 在 GitLab 项目中确认 `main` 有 `.gitlab-ci.yml`。
2. 工作台里把需求推进到已排期，指派平台开发并开始开发；服务端创建
   `feature/<需求编号>-<平台>` 分支。
3. 模拟开发者提交代码：通过 GitLab API/网页在该分支新增文件并提交；Runner 会跑
   `workbench-smoke` 流水线。
4. 工作台完成开发；服务端创建 MR，并查询该分支最新流水线。
5. GitLab Webhook 把流水线和 MR 状态回写到工作台开发任务。

## 已验证结果

2026-11-22 在本机 GitLab CE 17.11.4 + Runner 17.11.0 上，对 `workbench/trade-server` 和
`workbench/web` 各跑通 `server/test-gitlab-real.sh` 的 20 项断言：真实分支、开发者提交、
Runner 流水线成功、MR 创建、Webhook 回写新流水线。工作台详情截图见
`e2e/screenshots/workbench-gitlab-real.png`。

## 常见问题

- **宿主机访问 `/-/readiness` 返回 404**：GitLab 健康端点默认只允许容器内 127.0.0.1。
  Compose healthcheck 在容器内检查；宿主机用 `/users/sign_in` 返回 200 判断就绪。
- **Runner 在 Job 里克隆 `127.0.0.1:8929` 失败**：Runner 必须用容器内地址克隆。Compose 已
  用 `--clone-url http://gitlab:8929` 注册，并把 Job 容器加入 `dsh-gitlab-net`；不要改成
  宿主机的 `127.0.0.1`。
- **root 密码不生效**：`GITLAB_ROOT_PASSWORD` 只在数据卷首次初始化时使用。改密码需进容器
  `gitlab-rails runner` 或重置卷。
- **Docker Hub 拉取超时**：使用 README 中的 daocloud 镜像站拉取后重新 tag。
- **Webhook 一直 401、流水线/MR 状态不回写**：九成是服务端没拿到
  `GITLAB_WEBHOOK_SECRET`（启动命令里写错变量名、或没 `source` outputs 文件）。
  用上面「接到工作台服务端」里的两条 curl 自检：正确密钥应 200，错误密钥应 401。
  两种都 401 就是服务端侧密钥为空。

## 常用命令

```bash
docker compose -f deploy/gitlab/docker-compose.yml --env-file .local/gitlab.env ps
docker compose -f deploy/gitlab/docker-compose.yml --env-file .local/gitlab.env logs -f gitlab
docker compose -f deploy/gitlab/docker-compose.yml --env-file .local/gitlab.env down
# 保留数据卷；要彻底重置再加 -v
```

## 安全说明

- `.local/` 已加入 `.gitignore`，里面是 root 密码、机器人 token、Runner token。
- GitLab 只绑定本机端口，不暴露公网；Webhook 的 secret 用 `.local/gitlab.env` 里的
  `GITLAB_WEBHOOK_SECRET`，与 Rust 服务端一致。
- 机器人 token 是 `api` 权限的 impersonation token，仅用于本地 POC；正式环境应使用
  project access token 或专用服务账号，并限制到单个项目。
- GitLab CE 默认开启注册；本地 POC 够用。正式环境应关闭公开注册、启用 HTTPS 和备份。
