#!/usr/bin/env node
/**
 * 重建 UAT 基础数据：保留用户/平台/技能，清掉旧迭代与需求后创建两个迭代，
 * 并把 trade-server / web 平台指向本机 GitLab 项目。
 */
import fs from 'node:fs'

const BASE = process.env.WORKBENCH_SERVER_URL || 'http://127.0.0.1:3210'
const INTERNAL = process.env.WORKBENCH_INTERNAL_TOKEN || 'dsh-workbench-poc-internal-token'
const USERS = ['lisi', 'zhangsan', 'wangwu', 'zhaoliu', 'sunba', 'zhoujiu', 'qianqi', 'admin']

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
fs.writeFileSync('/tmp/wb-uat-tokens.json', JSON.stringify(tokens, null, 2))

const state = await direct('GET', '/state')
if (state.iterations.length !== 0 || state.requirements.length !== 0) {
  throw new Error(`期望空迭代/需求，实际 iterations=${state.iterations.length} requirements=${state.requirements.length}`)
}

const iterationSpecs = [
  { code: '2026-S12', name: '工作台协作增强', startDate: '2026-11-24', endDate: '2026-12-05' },
  { code: '2027-S01', name: '设计交付与附件', startDate: '2026-12-08', endDate: '2026-12-19' },
]
const iterations = []
for (const spec of iterationSpecs) {
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

fs.writeFileSync('/tmp/wb-uat/dataset.json', JSON.stringify({ createdAt: new Date().toISOString(), iterations }, null, 2))
console.log('wrote /tmp/wb-uat/dataset.json')
