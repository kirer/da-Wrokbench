#!/usr/bin/env node
/**
 * 用真实 headless DSH 跑一个角色在一条需求上的会话。
 *
 * 用法：
 *   node deploy/dsh-uat/run-role.mjs <role> <requirementCode> <tag> <promptFile>
 *   node deploy/dsh-uat/run-role.mjs --ensure
 *
 * 每个角色一个本地 Docker 容器，顶级目录独立挂载到 /workbench/<role>。
 * 容器内只能看到 /workbench 路径，宿主真实路径不会进入模型上下文。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const POC = path.resolve(HERE, '../..')
const RUNS = path.join(HERE, 'runs')
const CONTEXT = process.env.UAT_DOCKER_CONTEXT || 'desktop-linux'
const IMAGE = process.env.UAT_IMAGE || 'dsh-workbench-sim:0.1.0'
const SERVER = process.env.UAT_SERVER || 'http://host.docker.internal:3210'
const TOKEN = process.env.WORKBENCH_INTERNAL_TOKEN || 'dsh-workbench-poc-internal-token'
// 角色顶级目录都挂在同一个 UAT 根目录下；默认放在仓库外的同级目录，
// 也可以用 UAT_ROOT 指到别处。不要在脚本里写死某台机器的绝对路径。
const UAT_ROOT = path.resolve(process.env.UAT_ROOT || path.join(POC, '../../wb-uat'))
const PLAN_FILE = process.env.UAT_PLAN || path.join(UAT_ROOT, 'uat-plan.json')
const ROLE_HOST = Object.fromEntries(
  ['lisi', 'zhangsan', 'wangwu', 'zhaoliu', 'sunba', 'zhoujiu', 'qianqi', 'admin']
    .map(role => [role, path.join(UAT_ROOT, role)]),
)
const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'))
const planByCode = Object.fromEntries(plan.requirements.map(item => [item.code, item]))

fs.mkdirSync(RUNS, { recursive: true })

function docker(args, options = {}) {
  return spawnSync('docker', ['--context', CONTEXT, ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
    ...options,
  })
}

function must(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${what}: ${String(result.stderr || result.stdout || '').trim().slice(0, 800)}`)
  return result.stdout || ''
}

function container(role) {
  return `dsh-uat-${role}`
}

function ensureContainer(role) {
  if (!ROLE_HOST[role]) throw new Error(`未知角色 ${role}`)
  const name = container(role)
  const existing = docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']).stdout.trim()
  if (existing !== '') {
    const running = docker(['inspect', '-f', '{{.State.Running}}', name]).stdout.trim()
    if (running !== 'true') must(docker(['start', name]), `启动容器 ${name}`)
    return name
  }
  fs.mkdirSync(ROLE_HOST[role], { recursive: true })
  must(docker([
    'run', '-d', '--name', name,
    '-e', `DSH_WORKBENCH_BASE=/workbench/${role}`,
    '-e', `WORKBENCH_SERVER_URL=${SERVER}`,
    '-e', `WORKBENCH_INTERNAL_TOKEN=${TOKEN}`,
    '-e', 'MAGPIE_GATEWAY_KEY=local',
    '-v', `${ROLE_HOST[role]}:/workbench/${role}`,
    '-v', `${POC}:/opt/dsh-workbench:ro`,
    IMAGE,
  ]), `启动容器 ${name}`)
  return name
}

function ensureAll() {
  for (const role of Object.keys(ROLE_HOST)) ensureContainer(role)
}

function hostFolder(role, requirement) {
  return path.join(ROLE_HOST[role], requirement.iterationCode, requirement.title)
}

function containerFolder(role, requirement) {
  return `/workbench/${role}/${requirement.iterationCode}/${requirement.title}`
}

function readLocal(role) {
  const result = docker(['exec', container(role), 'cat', '/home/node/.dsh/cache/dsh-workbench-poc/local.json'])
  if (result.status !== 0) return { version: 1, users: {} }
  try { return JSON.parse(result.stdout) } catch { return { version: 1, users: {} } }
}

function writeLocal(role, data) {
  const payload = JSON.stringify(data, null, 2)
  const result = docker(['exec', '-i', container(role), 'sh', '-c',
    'mkdir -p /home/node/.dsh/cache/dsh-workbench-poc && cat > /home/node/.dsh/cache/dsh-workbench-poc/local.json && chmod 600 /home/node/.dsh/cache/dsh-workbench-poc/local.json',
  ], { input: payload })
  must(result, `写入 ${role} 的本地映射`)
}

function localUser(data, role) {
  if (!data.users[role]) {
    data.users[role] = {
      topLevelFolder: `/workbench/${role}`,
      folders: {}, sessions: {}, dshSessions: {}, sessionOwners: {}, sessionUsers: {}, greetedSessions: {},
    }
  }
  const user = data.users[role]
  user.topLevelFolder = `/workbench/${role}`
  user.folders ||= {}
  user.sessions ||= {}
  user.dshSessions ||= {}
  user.sessionOwners ||= {}
  user.sessionUsers ||= {}
  user.greetedSessions ||= {}
  return user
}

function mappingFor(role, requirement) {
  const data = readLocal(role)
  const user = localUser(data, role)
  return { data, user, mapped: user.sessions[requirement.sessions[role]] }
}

function bind(role, requirement, dshSessionId) {
  const data = readLocal(role)
  const user = localUser(data, role)
  const recordId = requirement.sessions[role]
  if (!recordId) throw new Error(`${requirement.code} 没有 ${role} 的会话记录`)
  user.sessions[recordId] = {
    dshSessionId,
    workspaceId: null,
    folderPath: `/workbench/${role}/${requirement.iterationCode}`,
  }
  user.dshSessions[dshSessionId] = recordId
  user.sessionOwners[dshSessionId] = recordId
  user.sessionUsers[dshSessionId] = role
  writeLocal(role, data)
}

function findSessionId(role, requirement) {
  const { mapped } = mappingFor(role, requirement)
  return mapped?.dshSessionId ?? null
}

function parseEvents(stdout) {
  const events = []
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue
    try { events.push(JSON.parse(line)) } catch { /* ignore */ }
  }
  return events
}

function runDsh(role, requirement, prompt, tag, sessionId) {
  const dir = containerFolder(role, requirement)
  const promptFile = `/tmp/dsh-prompt-${role}-${requirement.code}-${tag.replace(/[^a-zA-Z0-9._-]+/g, '_')}.txt`
  fs.mkdirSync(path.dirname(path.join(RUNS, 'x')), { recursive: true })
  const hostPrompt = path.join(RUNS, `_prompt-${role}-${requirement.code}-${tag}.txt`)
  fs.writeFileSync(hostPrompt, prompt)
  must(docker(['cp', hostPrompt, `${container(role)}:${promptFile}`]), '复制 prompt')
  const args = [
    'exec', '-w', dir, container(role), 'sh', '-c',
    `dsh --profile workbench-sim headless --json --permission-mode danger-full-access --approval-policy never${sessionId ? ` --session-id ${sessionId}` : ''} "$(cat ${promptFile})"`,
  ]
  const started = Date.now()
  const result = docker(args)
  const elapsed = Date.now() - started
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const base = path.join(RUNS, `${role}-${requirement.code}-${tag}`)
  fs.writeFileSync(`${base}.ndjson`, stdout)
  fs.writeFileSync(`${base}.stderr.log`, stderr)
  const events = parseEvents(stdout)
  const errorEvent = events.find(event => event.type === 'error')
  const sessionEvent = events.find(event => event.type === 'session')
  const finalEvent = [...events].reverse().find(event => event.type === 'final')
  const toolCalls = events.filter(event => event.type === 'tool_call')
  if (errorEvent) {
    throw new Error(`${role}/${requirement.code}/${tag} DSH 失败：${errorEvent.message}`)
  }
  if (result.status !== 0 && !finalEvent) {
    throw new Error(`${role}/${requirement.code}/${tag} DSH 退出码 ${result.status}：${stderr.trim().slice(-500)}`)
  }
  return {
    sessionId: sessionEvent?.sessionId ?? sessionId ?? null,
    finalText: String(finalEvent?.text ?? '').trim(),
    toolCalls: toolCalls.map(call => ({ tool: call.tool, input: call.input })),
    elapsed,
    base,
  }
}

function ensureSession(role, requirement) {
  const existing = findSessionId(role, requirement)
  if (existing) return existing
  const hostDir = hostFolder(role, requirement)
  fs.mkdirSync(hostDir, { recursive: true })
  const boot = runDsh(role, requirement, '只回复 OK，不要调用任何工具。', 'bootstrap', null)
  if (!boot.sessionId) throw new Error(`${role}/${requirement.code} 引导会话没有返回 sessionId`)
  bind(role, requirement, boot.sessionId)
  console.log(`  ${role} 新建 DSH 会话 ${boot.sessionId}`)
  return boot.sessionId
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--ensure') {
    ensureAll()
    console.log('所有角色容器已就绪')
    return
  }
  if (args[0] === '--bootstrap') {
    const [, role, code] = args
    const requirement = planByCode[code]
    if (!role || !requirement) throw new Error('用法: --bootstrap <role> <code>')
    ensureContainer(role)
    fs.mkdirSync(hostFolder(role, requirement), { recursive: true })
    const sessionId = ensureSession(role, requirement)
    console.log(`${role}/${code} -> ${sessionId}`)
    return
  }
  const [role, code, tag, promptFile] = args
  if (!role || !code || !tag || !promptFile) {
    console.error('用法: node deploy/dsh-uat/run-role.mjs <role> <code> <tag> <promptFile>')
    process.exit(2)
  }
  const requirement = planByCode[code]
  if (!requirement) throw new Error(`plan 中没有 ${code}`)
  ensureContainer(role)
  const hostDir = hostFolder(role, requirement)
  fs.mkdirSync(hostDir, { recursive: true })
  const prompt = fs.readFileSync(promptFile, 'utf8')
  let sessionId = ensureSession(role, requirement)
  let outcome
  try {
    outcome = runDsh(role, requirement, prompt, tag, sessionId)
  } catch (error) {
    if (!/unknown session|not found|was recorded in/i.test(String(error.message))) throw error
    console.log('  DSH 会话不可用，重新引导')
    const boot = runDsh(role, requirement, '只回复 OK，不要调用任何工具。', `${tag}-bootstrap`, null)
    if (!boot.sessionId) throw new Error('重新引导会话失败')
    bind(role, requirement, boot.sessionId)
    outcome = runDsh(role, requirement, prompt, tag, boot.sessionId)
  }
  const tools = outcome.toolCalls.map(call => call.tool).join(', ') || '无工具调用'
  console.log(`\n[${role}/${requirement.code}/${tag}] ${(outcome.elapsed / 1000).toFixed(1)}s`)
  console.log(`工具：${tools}`)
  console.log(`结论：${outcome.finalText.replace(/\s+/g, ' ').slice(0, 500)}`)
  console.log(`日志：${path.relative(POC, outcome.base)}.ndjson`)
}

main()
