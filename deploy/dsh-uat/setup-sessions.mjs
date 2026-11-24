import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.WORKBENCH_SERVER_URL || 'http://127.0.0.1:3210'
const TOKEN = process.env.WORKBENCH_INTERNAL_TOKEN || 'dsh-workbench-poc-internal-token'
// 每个角色一个顶级目录，统一挂在 UAT 根目录下（默认仓库外的 ../wb-uat，
// 可用 UAT_ROOT 覆盖）。脚本里不写死某台机器的绝对路径。
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const UAT_ROOT = path.resolve(process.env.UAT_ROOT || path.join(REPO_ROOT, '../wb-uat'))
const TOP = Object.fromEntries(
  ['lisi', 'zhangsan', 'wangwu', 'zhaoliu', 'sunba', 'zhoujiu', 'qianqi', 'admin']
    .map(role => [role, path.join(UAT_ROOT, role)]),
)
const ROLE_SESSIONS = [
  ['lisi', 'requirement', '产品需求会话'],
  ['wangwu', 'design', '设计会话'],
  ['zhangsan', 'review', '负责人评审会话'],
  ['zhaoliu', 'dev', '服务端开发会话'],
  ['sunba', 'dev', '前端开发会话'],
  ['qianqi', 'test', '测试会话'],
]

async function api(actor, method, route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-workbench-internal-token': TOKEN,
      'x-workbench-actor': actor,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { error: text } }
  if (!res.ok) throw new Error(`${method} ${route} as ${actor}: ${res.status} ${data.error || text}`)
  return data
}

const state = await api('admin', 'GET', '/state')
const targets = state.requirements.filter(req => ['S12-001', 'S12-002', 'S12-003', 'S01-001', 'S01-002', 'S01-003'].includes(req.code))
if (targets.length !== 6) throw new Error(`expected 6 requirements, got ${targets.length}`)
const plan = { createdAt: new Date().toISOString(), topLevelFolders: TOP, requirements: [] }
for (const req of targets.sort((a, b) => a.code.localeCompare(b.code))) {
  const iteration = state.iterations.find(item => item.id === req.iterationId)
  const folder = `${TOP.lisi}/${iteration.code}/${req.title}`
  const sessions = {}
  // 产品会话必须先建并 bind，需求才会从 creating 进入 draft；之后才能建其他角色的会话。
  const existingProduct = (req.sessions || []).find(item => item.type === 'requirement' && item.createdBy === 'lisi' && !item.archived)
  sessions.lisi = existingProduct
    ? existingProduct.id
    : (await api('lisi', 'POST', `/requirements/${encodeURIComponent(req.id)}/sessions`, {
        type: 'requirement', label: '产品需求会话',
      })).session.id
  const bound = await api('lisi', 'POST', `/requirements/${encodeURIComponent(req.id)}/bind`, {
    sessionRecordId: sessions.lisi,
  })
  for (const [actor, type, label] of ROLE_SESSIONS) {
    if (actor === 'lisi') continue
    const existing = (req.sessions || []).find(item => item.type === type && item.createdBy === actor && !item.archived)
    if (existing) { sessions[actor] = existing.id; continue }
    const result = await api(actor, 'POST', `/requirements/${encodeURIComponent(req.id)}/sessions`, { type, label })
    sessions[actor] = result.session.id
  }
  plan.requirements.push({
    id: req.id,
    code: req.code,
    title: req.title,
    iterationId: req.iterationId,
    iterationCode: iteration.code,
    platforms: req.platformIds,
    folder,
    sessions,
    status: bound.requirement.status,
  })
  console.log(`${req.code} ${req.title} -> ${bound.requirement.status} sessions=${JSON.stringify(sessions)}`)
}
const PLAN_FILE = process.env.UAT_PLAN || path.join(UAT_ROOT, 'uat-plan.json')
fs.mkdirSync(UAT_ROOT, { recursive: true, mode: 0o700 })
// 计划文件里有本机目录和 DSH 会话 ID，只给当前用户读。
fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2), { mode: 0o600 })
fs.chmodSync(PLAN_FILE, 0o600)
console.log(`wrote ${PLAN_FILE}`)
