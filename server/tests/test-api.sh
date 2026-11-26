#!/usr/bin/env bash
# 工作台 Rust 服务端端到端 API 验证。
# 依赖：curl、jq。服务端需已启动，且必须用 BASE 显式指定测试服务端。
# 该脚本会创建一条测试需求和一条测试技能，请在测试数据库上运行。
set -euo pipefail

# 默认端口 3210 常常是正在使用的本机工作台；不显式指定时不往上写测试数据。
if [ -z "${BASE:-}" ] && [ "${WORKBENCH_TEST_ALLOW_LIVE:-0}" != "1" ]; then
  echo "test-api.sh 会写入测试需求与技能，请先指定测试服务端：" >&2
  echo "  BASE=http://127.0.0.1:3211 bash server/tests/test-api.sh" >&2
  echo "确实要写默认端口 3210 时，设置 WORKBENCH_TEST_ALLOW_LIVE=1。" >&2
  exit 1
fi

BASE="${BASE:-http://127.0.0.1:3210}"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

pass=0
fail=0

ok() {
  pass=$((pass + 1))
  printf '  ✓ %s\n' "$1"
}

bad() {
  fail=$((fail + 1))
  printf '  ✗ %s\n' "$1" >&2
}

status() {
  curl -s -o "$BODY_FILE" -w '%{http_code}' "$@" || true
}

# 断言只记录失败，不因 set -e 中断后续用例；最终统一以 fail 计数决定退出码。
expect() {
  local expected="$1"
  shift
  local actual
  actual="$(status "$@")"
  if [ "$actual" = "$expected" ]; then
    ok "HTTP $expected"
  else
    bad "期望 HTTP $expected，实际 $actual：$(cat "$BODY_FILE")"
  fi
}

check_eq() {
  local actual="$1" expected="$2" label="$3"
  if [ "$actual" = "$expected" ]; then
    ok "$label"
  else
    bad "$label（期望 $expected，实际 ${actual:-<空>}）"
  fi
}

check_json() {
  local filter="$1" label="$2"
  if jq -e "$filter" "$BODY_FILE" >/dev/null 2>&1; then
    ok "$label"
  else
    bad "$label（jq 断言失败：$filter）"
  fi
}

login() {
  curl -sS -X POST "$BASE/auth/mock" \
    -H 'content-type: application/json' \
    -d "{\"userId\":\"$1\"}" | jq -r '.token // empty'
}

auth() {
  printf 'authorization: Bearer %s' "$1"
}

echo "== 登录 =="
T_LISI="$(login lisi)"
T_ZS="$(login zhangsan)"
T_ADMIN="$(login admin)"
T_DEV="$(login zhaoliu)"
T_SUNBA="$(login sunba)"
T_QA="$(login qianqi)"
T_DESIGN="$(login wangwu)"
check_eq "${T_LISI:+set}" "set" "产品、负责人、管理员、开发、测试、设计均已登录"

echo "== 基线迭代 =="
# 用例假定单人评审；先切回 S11，避免上一次运行把当前迭代留在多人会签的 S12/S99。
expect 200 -X POST "$BASE/iterations/iteration-2026-s11/select" -H "$(auth "$T_LISI")"
ok "当前迭代切回 S11"

echo "== 状态与通知 =="
expect 200 "$BASE/state" -H "$(auth "$T_LISI")"
check_json '.requirements | length >= 9' "种子需求已加载"
check_json '.unreadNotificationCount >= 1' "未读通知可读取"
check_json '.notificationGroups | length > 0' "通知按需求聚合"

echo "== 创建需求、绑定会话 =="
expect 201 -X POST "$BASE/requirements" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"title":"API 生命周期验证"}'
REQ_ID="$(jq -r .requirement.id "$BODY_FILE")"
REQ_CODE="$(jq -r .requirement.code "$BODY_FILE")"
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "creating" "新需求进入创建中：$REQ_CODE"

expect 200 -X POST "$BASE/requirements/$REQ_ID/sessions" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"type":"requirement","label":"验证需求会话"}'
SESSION_RECORD="$(jq -r .session.id "$BODY_FILE")"
check_eq "${SESSION_RECORD:+set}" "set" "会话记录已创建"

expect 200 -X POST "$BASE/requirements/$REQ_ID/bind" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d "{\"sessionRecordId\":\"$SESSION_RECORD\"}"
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "draft" "绑定后进入草稿"

echo "== 需求活文档与附件 =="
expect 200 -X POST "$BASE/requirements/$REQ_ID/document" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' \
  -d '{"summary":"API 活文档摘要","acceptanceCriteria":"1. 可保存\n2. 可读取","body":"背景说明"}'
check_eq "$(jq -r .requirement.document.version "$BODY_FILE")" "1" "需求文档版本递增"
check_eq "$(jq -r .requirement.document.summary "$BODY_FILE")" "API 活文档摘要" "需求文档摘要已保存"
expect 403 -X POST "$BASE/requirements/$REQ_ID/document" -H "$(auth "$T_DEV")" \
  -H 'content-type: application/json' -d '{"summary":"越权修改"}'
ok "开发不能编辑需求文档"
expect 201 -X POST "$BASE/requirements/$REQ_ID/artifacts" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' \
  -d '{"name":"acceptance.txt","contentType":"text/plain","content":"验收附件正文","kind":"attachment"}'
ARTIFACT_ID="$(jq -r .artifact.id "$BODY_FILE")"
check_eq "${ARTIFACT_ID:+set}" "set" "附件元数据已保存"
expect 200 "$BASE/artifacts/$ARTIFACT_ID" -H "$(auth "$T_ZS")"
check_eq "$(jq -r .content "$BODY_FILE")" "验收附件正文" "附件正文可跨用户读取"
expect 201 -X POST "$BASE/requirements/$REQ_ID/artifacts" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' \
  -d '{"name":"binary.bin","contentType":"application/octet-stream","content":"aGVsbG8=","encoding":"base64","kind":"attachment"}'
check_eq "$(jq -r .artifact.encoding "$BODY_FILE")" "base64" "二进制附件按 base64 保存"
expect 200 -X POST "$BASE/requirements/$REQ_ID/sessions/$SESSION_RECORD/archive" \
  -H "$(auth "$T_LISI")" -H 'content-type: application/json' -d '{}'
check_eq "$(jq -r --arg sid "$SESSION_RECORD" '.requirement.sessions[] | select(.id==$sid) | .archived' "$BODY_FILE")" "true" "会话可归档"
expect 200 -X POST "$BASE/requirements/$REQ_ID/sessions/$SESSION_RECORD/restore" \
  -H "$(auth "$T_LISI")" -H 'content-type: application/json' -d '{}'
check_eq "$(jq -r --arg sid "$SESSION_RECORD" '.requirement.sessions[] | select(.id==$sid) | .archived' "$BODY_FILE")" "false" "会话可恢复"

echo "== 提交与评审权限 =="
expect 200 -X POST "$BASE/requirements/$REQ_ID/submit" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"summary":"验证提交"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "pending_review" "提交后进入待评审"

expect 403 -X POST "$BASE/requirements/$REQ_ID/review" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"decision":"approve"}'
ok "产品不能评审"

expect 200 -X POST "$BASE/requirements/$REQ_ID/review" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"decision":"approve","comment":"API 验证通过"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "approved" "负责人评审通过"
check_eq "$(jq -r .requirement.inScope "$BODY_FILE")" "true" "通过后纳入本期"

echo "== 排期与范围 =="
expect 200 -X POST "$BASE/requirements/$REQ_ID/schedule" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"startDate":"2026-11-24","endDate":"2026-11-28"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "scheduled" "排期后进入已排期"

expect 403 -X POST "$BASE/requirements/$REQ_ID/schedule" -H "$(auth "$T_DEV")" \
  -H 'content-type: application/json' -d '{"startDate":"2026-11-25"}'
ok "开发不能排期"

expect 200 -X POST "$BASE/requirements/$REQ_ID/scope" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"inScope":false,"reason":"API 验证暂缓"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "backlog" "移出范围进入暂缓"

expect 200 -X POST "$BASE/requirements/$REQ_ID/scope" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"inScope":true,"reason":"API 验证恢复"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "scheduled" "纳入范围回到已排期"

echo "== 开发与晚到设计 =="
expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-assign" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"platformId":"trade-server","assigneeId":"zhaoliu"}'
ok "负责人指派交易服务端开发"

expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-start" -H "$(auth "$T_DEV")" \
  -H 'content-type: application/json' -d '{"platformId":"trade-server"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "in_progress" "开发开始，需求进入开发中"

expect 200 -X POST "$BASE/requirements/$REQ_ID/design-claim" -H "$(auth "$T_DESIGN")"
ok "设计认领"

expect 200 -X POST "$BASE/requirements/$REQ_ID/design-deliver" -H "$(auth "$T_DESIGN")" \
  -H 'content-type: application/json' -d '{"summary":"开发开始后交付的设计","files":["index.html"]}'
check_json '.requirement.designUpdatedAt != null' "开发开始后交付设计，标记设计已更新"

expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-assign" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"platformId":"web","assigneeId":"sunba"}'
expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-start" -H "$(auth "$T_SUNBA")" \
  -H 'content-type: application/json' -d '{"platformId":"web"}'
expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-finish" -H "$(auth "$T_SUNBA")" \
  -H 'content-type: application/json' -d '{"platformId":"web"}'
ok "Web 平台完成开发"

expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-finish" -H "$(auth "$T_DEV")" \
  -H 'content-type: application/json' -d '{"platformId":"trade-server"}'
check_json '.requirement.devTasks[0].mrUrl != null' "完成开发生成 Mock MR"
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "dev_done" "所有平台开发完成进入待测试"

echo "== 测试、冻结、发布 =="
expect 200 -X POST "$BASE/requirements/$REQ_ID/test-start" -H "$(auth "$T_QA")"
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "testing" "测试开始"

expect 200 -X POST "$BASE/requirements/$REQ_ID/test-fail" -H "$(auth "$T_QA")" \
  -H 'content-type: application/json' -d '{"note":"API 验证缺陷","bugUrl":"https://bug.example.com/TEST-1"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "test_failed" "测试失败进入测试不通过"

expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-reopen" -H "$(auth "$T_DEV")" \
  -H 'content-type: application/json' -d '{"platformId":"trade-server"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "in_progress" "开发重新打开"

expect 200 -X POST "$BASE/requirements/$REQ_ID/dev-finish" -H "$(auth "$T_DEV")" \
  -H 'content-type: application/json' -d '{"platformId":"trade-server","note":"修复完成"}'
expect 200 -X POST "$BASE/requirements/$REQ_ID/test-start" -H "$(auth "$T_QA")"
expect 200 -X POST "$BASE/requirements/$REQ_ID/test-pass" -H "$(auth "$T_QA")" \
  -H 'content-type: application/json' -d '{"note":"API 验证通过"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "test_passed" "测试通过"

expect 403 -X POST "$BASE/requirements/$REQ_ID/freeze" -H "$(auth "$T_QA")"
ok "测试不能冻结"

expect 200 -X POST "$BASE/requirements/$REQ_ID/freeze" -H "$(auth "$T_ZS")"
expect 200 -X POST "$BASE/requirements/$REQ_ID/release" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"version":"v9.9.9"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "released" "冻结后发布"
check_eq "$(jq -r .requirement.release.version "$BODY_FILE")" "v9.9.9" "发布版本已记录"

echo "== 会签 =="
expect 200 -X POST "$BASE/iterations/iteration-2026-s12/select" -H "$(auth "$T_LISI")"
expect 201 -X POST "$BASE/requirements" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"title":"API 会签验证"}'
REQ2_ID="$(jq -r .requirement.id "$BODY_FILE")"
expect 200 -X POST "$BASE/requirements/$REQ2_ID/sessions" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"type":"requirement","label":"会签需求会话"}'
SESSION2="$(jq -r .session.id "$BODY_FILE")"
expect 200 -X POST "$BASE/requirements/$REQ2_ID/bind" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d "{\"sessionRecordId\":\"$SESSION2\"}"
expect 200 -X POST "$BASE/requirements/$REQ2_ID/submit" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"summary":"会签验证"}'
check_eq "$(jq -r '.requirement.reviewerIds | length' "$BODY_FILE")" "2" "S12 需求默认两个会签人"

expect 200 -X POST "$BASE/requirements/$REQ2_ID/review" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"decision":"approve","comment":"第一位通过"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "pending_review" "单人通过仍待评审"

expect 200 -X POST "$BASE/requirements/$REQ2_ID/review" -H "$(auth "$T_ADMIN")" \
  -H 'content-type: application/json' -d '{"decision":"approve","comment":"第二位通过"}'
check_eq "$(jq -r .requirement.status "$BODY_FILE")" "approved" "全部会签通过后已通过"

echo "== 技能管理 =="
expect 200 "$BASE/skills" -H "$(auth "$T_LISI")"
check_json '.skills | length >= 16' "技能列表可读取"
SKILL_NAME="api-verify-skill-$(date +%s)-$$"
expect 201 -X POST "$BASE/skills" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"$SKILL_NAME\",\"description\":\"API 验证技能\",\"rolePacks\":[\"product\"],\"content\":\"# API 验证技能\",\"summary\":\"v1\",\"scope\":\"global\"}"
SKILL_ID="$(jq -r .skill.id "$BODY_FILE")"
check_eq "$(jq -r .skill.status "$BODY_FILE")" "pending_review" "非负责人上传自动进入待审核"
expect 200 -X POST "$BASE/skills/$SKILL_ID/review" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"decision":"approve","comment":"验证通过"}'
check_eq "$(jq -r .skill.status "$BODY_FILE")" "active" "负责人审核后技能启用"
expect 200 "$BASE/skills/published" -H "$(auth "$T_LISI")"
check_json ".skills | map(.name) | index(\"$SKILL_NAME\") != null" "已发布技能可同步"

echo "== 迭代管理 =="
expect 201 -X POST "$BASE/iterations" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d "{\"code\":\"2026-S99-$(date +%s)-$$\",\"name\":\"API 迭代验证\",\"startDate\":\"2027-01-01\",\"endDate\":\"2027-01-31\"}"
ITER99="$(jq -r .iteration.id "$BODY_FILE")"
check_eq "$(jq -r .iteration.status "$BODY_FILE")" "planning" "新迭代进入规划中"
expect 200 -X POST "$BASE/iterations/$ITER99" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d '{"name":"API 迭代验证（已改名）","status":"in_progress"}'
check_eq "$(jq -r .iteration.name "$BODY_FILE")" "API 迭代验证（已改名）" "迭代可编辑"
expect 200 -X POST "$BASE/iterations/$ITER99/select" -H "$(auth "$T_LISI")"
expect 201 -X POST "$BASE/requirements" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"title":"API 跨迭代验证"}'
REQ3_ID="$(jq -r .requirement.id "$BODY_FILE")"
REQ3_CODE="$(jq -r .requirement.code "$BODY_FILE")"
expect 200 -X POST "$BASE/requirements/$REQ3_ID/sessions" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d '{"type":"requirement","label":"跨迭代会话"}'
SESSION3="$(jq -r .session.id "$BODY_FILE")"
expect 200 -X POST "$BASE/requirements/$REQ3_ID/bind" -H "$(auth "$T_LISI")" \
  -H 'content-type: application/json' -d "{\"sessionRecordId\":\"$SESSION3\"}"
expect 200 -X POST "$BASE/iterations/iteration-2026-s11/move-requirement" -H "$(auth "$T_ZS")" \
  -H 'content-type: application/json' -d "{\"requirement\":\"$REQ3_ID\"}"
MOVED_CODE="$(jq -r .requirement.code "$BODY_FILE")"
case "$MOVED_CODE" in
  S11-*) ok "需求跨迭代移动并重新编号：$REQ3_CODE → $MOVED_CODE" ;;
  *) bad "跨迭代编号不正确：$MOVED_CODE" ;;
esac
expect 200 -X POST "$BASE/iterations/$ITER99/archive" -H "$(auth "$T_ZS")"
check_eq "$(jq -r .iteration.archived "$BODY_FILE")" "true" "迭代可归档"
expect 200 -X POST "$BASE/iterations/$ITER99/restore" -H "$(auth "$T_ZS")"
check_eq "$(jq -r .iteration.archived "$BODY_FILE")" "false" "迭代可恢复"

echo "== 事件与审计 =="
expect 200 "$BASE/events?since=0&limit=200" -H "$(auth "$T_LISI")"
check_json '.events | length >= 20' "事件流已记录"
expect 403 "$BASE/audit" -H "$(auth "$T_LISI")"
ok "非管理员不能看审计日志"
expect 200 "$BASE/audit" -H "$(auth "$T_ADMIN")"
ok "管理员可看审计日志"

echo
if [ "$fail" -ne 0 ]; then
  echo "失败 $fail 项，通过 $pass 项" >&2
  exit 1
fi
echo "全部通过（$pass 项）"
