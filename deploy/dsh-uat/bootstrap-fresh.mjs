#!/usr/bin/env node
/**
 * 重建 UAT 基础数据：保留用户/平台/技能，清掉旧迭代与需求后创建两个迭代，
 * 并把 trade-server / web 平台指向本机 GitLab 项目。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.WORKBENCH_SERVER_URL || 'http://127.0.0.1:3210'
const INTERNAL = process.env.WORKBENCH_INTERNAL_TOKEN || 'dsh-workbench-poc-internal-token'
const USERS = ['lisi', 'zhangsan', 'wangwu', 'zhaoliu', 'sunba', 'zhoujiu', 'qianqi', 'admin']
// 令牌文件里有 8 个账号的完整 JWT，等同于密码：写到 UAT 根目录（默认仓库外）
// 并设 0600，不能落在全局可读的 /tmp。
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const UAT_ROOT = path.resolve(process.env.UAT_ROOT || path.join(REPO_ROOT, '../wb-uat'))
const TOKENS_FILE = process.env.UAT_TOKENS || path.join(UAT_ROOT, 'tokens.json')

function writePrivate(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, data, { mode: 0o600 })
  fs.chmodSync(file, 0o600)
}

async function direct(method, route, body, token) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : { 'x-workbench-internal-token': INTERNAL, 'x-workbench-actor': 'admin' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { error: text } }
  if (!res.ok) throw new Error(`${method} ${route}: ${res.status} ${data.error || text}`)
  return data
}

const tokens = {}
for (const id of USERS) {
  const result = await direct('POST', '/auth/mock', { userId: id })
  tokens[id] = result.token
  console.log(`token ${id} ok`)
}
writePrivate(TOKENS_FILE, JSON.stringify(tokens, null, 2))
console.log(`wrote ${TOKENS_FILE} (0600)`)

const state = await direct('GET', '/state')
// 只跳过已经建过的 S12/S01，不要求整库为空：这个脚本要能重跑，
// 否则第二次执行必然在断言处失败，留下一半数据。
const existing = new Set(state.iterations.map(item => item.code))

const iterationSpecs = [
  { code: '2026-S12', name: '工作台协作增强', startDate: '2026-11-24', endDate: '2026-12-05' },
  { code: '2027-S01', name: '设计交付与附件', startDate: '2026-12-08', endDate: '2026-12-19' },
]
const iterations = state.iterations.filter(item => iterationSpecs.some(spec => spec.code === item.code))
for (const spec of iterationSpecs) {
  if (existing.has(spec.code)) {
    console.log(`iteration ${spec.code} 已存在，跳过`)
    continue
  }
  const created = await direct('POST', '/iterations', { ...spec, reviewerIds: ['zhangsan'] })
  const iteration = await direct('POST', `/iterations/${encodeURIComponent(created.iteration.id)}`, { status: 'in_progress' })
  iterations.push(iteration.iteration)
  console.log(`iteration ${iteration.iteration.code} ${iteration.iteration.id}`)
}

const platformUpdates = [
  ['trade-server', { gitlabProjectId: '1', gitlabProjectPath: 'workbench/trade-server' }],
  ['web', { gitlabProjectId: '2', gitlabProjectPath: 'workbench/web' }],
]
for (const [id, patch] of platformUpdates) {
  await direct('POST', `/platforms/${encodeURIComponent(id)}`, patch)
  console.log(`platform ${id} -> GitLab ${patch.gitlabProjectPath}`)
}

const DATASET_FILE = process.env.UAT_DATASET || path.join(UAT_ROOT, 'dataset.json')
writePrivate(DATASET_FILE, JSON.stringify({ createdAt: new Date().toISOString(), iterations }, null, 2))
console.log(`wrote ${DATASET_FILE}`)
