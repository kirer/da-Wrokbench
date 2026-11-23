#!/usr/bin/env node
// 本地集成测试桩：模拟钉钉开放平台与 GitLab API。
// 只用于测试，不包含任何真实凭据；请求记录可通过 /__requests 读取。
import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 4399)
const requests = []

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      try { resolve(raw === '' ? {} : JSON.parse(raw)) } catch { resolve({ raw }) }
    })
  })
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const body = await readBody(req)
  requests.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: {
      authorization: req.headers.authorization || '',
      privateToken: req.headers['private-token'] || '',
      gitlabToken: req.headers['x-gitlab-token'] || '',
    },
    body,
  })

  if (url.pathname === '/__requests') return send(res, 200, requests)
  if (url.pathname === '/__reset') {
    requests.length = 0
    return send(res, 200, { ok: true })
  }

  // ---- 钉钉开放平台 ----
  if (url.pathname === '/gettoken') {
    return send(res, 200, { errcode: 0, errmsg: 'ok', access_token: 'mock-dingtalk-token', expires_in: 7200 })
  }
  if (url.pathname === '/topapi/v2/department/listsub') {
    return send(res, 200, {
      errcode: 0,
      errmsg: 'ok',
      result: [
        { dept_id: 1, name: '总部', parent_id: 0 },
        { dept_id: 2, name: '交易研发组', parent_id: 1 },
      ],
    })
  }
  if (url.pathname === '/topapi/v2/user/list') {
    const dept = Number(body.dept_id || url.searchParams.get('dept_id') || 1)
    const list = dept === 2
      ? [
          { userid: 'mock-dev-1', name: '钉钉开发甲', title: '工程师', dept_id_list: [2] },
          { userid: 'mock-design-1', name: '钉钉设计乙', title: '设计师', dept_id_list: [2] },
        ]
      : [{ userid: 'mock-lead-1', name: '钉钉负责人', title: '负责人', dept_id_list: [1] }]
    return send(res, 200, { errcode: 0, errmsg: 'ok', result: { list, has_more: false } })
  }
  if (url.pathname === '/topapi/message/corpconversation/asyncsend_v2') {
    return send(res, 200, { errcode: 0, errmsg: 'ok', task_id: 1001 })
  }

  // ---- GitLab API ----
  const branchMatch = /^\/api\/v4\/projects\/([^/]+)\/repository\/branches$/.exec(url.pathname)
  if (branchMatch && req.method === 'POST') {
    return send(res, 201, { name: body.branch, commit: { id: 'mock-commit' } })
  }
  const mrMatch = /^\/api\/v4\/projects\/([^/]+)\/merge_requests$/.exec(url.pathname)
  if (mrMatch) {
    if (req.method === 'POST') {
      return send(res, 201, {
        iid: 7,
        web_url: 'http://gitlab.mock/group/project/-/merge_requests/7',
        source_branch: body.source_branch,
      })
    }
    return send(res, 200, [])
  }
  const pipelineMatch = /^\/api\/v4\/projects\/([^/]+)\/pipelines$/.exec(url.pathname)
  if (pipelineMatch) {
    return send(res, 200, [{
      status: 'success',
      web_url: 'http://gitlab.mock/group/project/-/pipelines/42',
    }])
  }

  return send(res, 404, { error: `mock 未实现 ${req.method} ${url.pathname}` })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock integrations listening on http://127.0.0.1:${PORT}`)
})
