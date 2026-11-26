/**
 * 我的作品的接口（右侧栏 › 设计库 › 我的作品）：
 *
 *   GET  works                       我的作品（顺手从设计画布缓存补回以前的设计）
 *   POST works      { op, dir, to? } pin / unpin / hide（移出列表）/ reveal（在文件夹里显示）/ relocate（挪走了，重新定位）
 *   GET  workthumb  ?id=             作品缩略图（第一屏，无头浏览器截的，按文件修改时间缓存）
 *   POST pack       { dir, license } 打成 zip：先规范化，再查一遍；过了存到「下载」
 *   POST usezip     { session, name, data } 拖进来的 zip →「用这个开始」：查、落到新文件夹、登记、打开
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { listScreens, allScreens } from '../core.js'
import { parseMeta, metaOfFile, KIND_SIZE, prepare } from '../look.js'
import { packDesign, zipOf, splitTitle } from './pack.js'
import { PERSONAL_CODES } from './policy.js'
import { readZip, ZipError } from './zip.js'
import { preparePack, installPack, baseFor, slugOf, UseError } from './use.js'

const THUMB_DIR = path.join(os.homedir(), '.dsh', 'cache', 'dsh-workbench', 'canvas', 'works', 'thumbs')
const MAX_ZIP_BODY = 12 * 1024 * 1024 // base64 的 8MB zip

const idOf = (dir) => crypto.createHash('sha1').update(path.resolve(dir)).digest('hex').slice(0, 16)

/** 页面开头的 <title>（只读前 16KB） */
function headTitle(file) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(16384)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    const m = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(buf.subarray(0, n).toString('utf8'))
    return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim() : ''
  } catch { return '' } finally { if (fd != null) try { fs.closeSync(fd) } catch { /* 关过了 */ } }
}

function localManifest(dir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'design.json'), 'utf8'))
    return m && typeof m === 'object' && !Array.isArray(m) ? m : null
  } catch { return null }
}
function manifestTitle(dir) {
  const t = (localManifest(dir) || {}).title
  return t && typeof t === 'object' ? String(t.zh || t.en || '').slice(0, 40) : ''
}
/** 一条作品记录 → 右侧栏卡片要的样子（目录不在了 exists: false） */
export function describeWork(w) {
  const dir = w.dir
  let exists = false
  try { exists = fs.statSync(dir).isDirectory() } catch { exists = false }
  const base = { id: idOf(dir), dir, name: path.basename(dir), pinned: !!w.pinned, trust: w.trust || '', from: w.from || null, added: w.added || 0, exists }
  if (!exists) return { ...base, title: w.title || path.basename(dir), kind: w.kind || '', screens: w.screens || 0, updated: w.updated || w.seen || 0 }
  const screens = listScreens(dir)
  let updated = 0
  let sig = ''
  for (const f of screens) {
    try {
      const st = fs.statSync(path.join(dir, f))
      updated = Math.max(updated, st.mtimeMs)
      if (!sig) sig = `${f}:${Math.round(st.mtimeMs)}:${st.size}`
    } catch { /* 刚删了 */ }
  }
  const first = screens[0] ? path.join(dir, screens[0]) : ''
  const product = first ? splitTitle(headTitle(first)).product : ''
  const kind = w.kind || (first ? parseMeta(metaOfFile(first)).kind : '') || 'web'
  return { ...base, title: manifestTitle(dir) || product || w.title || path.basename(dir), kind, screens: screens.length, first: screens[0] || '', updated: Math.round(updated || w.updated || w.seen || 0), thumb: sig ? crypto.createHash('sha1').update(sig).digest('hex').slice(0, 10) : '' }
}

export function createLibraryRoutes({ admit, readBody, json, tracker, library, studio, open, storeLoad, version = '', exported, log = () => {}, thumbDir = THUMB_DIR, downloads = path.join(os.homedir(), 'Downloads'), sessionCwd = async (id) => tracker.cwdOf(id) }) {
  const lang = (body) => (body && body.lang === 'en' ? 'en' : 'zh')

  // 作品库里登记的、目录在哪（id → 记录）：只认列得出来的，别让请求指到别的目录
  const byId = (id) => library.list().find((w) => idOf(w.dir) === id) || null
  const byDir = (dir) => {
    const w = library.get(String(dir || ''))
    return w && !w.hidden ? w : null
  }

  function synced() {
    try { library.sync(storeLoad()) } catch (e) { if (e.code !== 'ENOENT') log(e) }
  }

  async function works(req, res) {
    if (!admit(req, res)) return
    if (req.method === 'GET') {
      synced()
      const list = library.list().filter((w) => !w.hidden).map(describeWork)
      list.sort((a, b) => (b.pinned - a.pinned) || (b.exists - a.exists) || (b.updated - a.updated))
      return json(res, 200, { works: list.slice(0, 500) })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
    let body
    try { body = await readBody(req) } catch (e) { return json(res, 400, { error: e.message }) }
    const w = byDir(body.dir)
    if (!w) return json(res, 404, { error: 'not in library' })
    switch (body.op) {
      case 'pin':
      case 'unpin':
        library.put(w.dir, { pinned: body.op === 'pin' ? true : undefined })
        break
      case 'hide':
        library.hide(w.dir)
        break
      case 'reveal': {
        if (!fs.existsSync(w.dir)) return json(res, 404, { error: 'gone' })
        const [cmd, args] = process.platform === 'darwin' ? ['open', [w.dir]] : process.platform === 'win32' ? ['explorer', [w.dir]] : ['xdg-open', [w.dir]]
        execFile(cmd, args, (e) => { if (e && process.platform !== 'win32') log(e) })
        break
      }
      case 'relocate': {
        const to = path.resolve(String(body.to || ''))
        let ok = false
        try { ok = fs.statSync(to).isDirectory() && listScreens(to).length > 0 } catch { ok = false }
        if (!ok) return json(res, 400, { error: 'noScreens' })
        library.move(w.dir, to)
        break
      }
      default:
        return json(res, 400, { error: 'bad op' })
    }
    json(res, 200, { ok: true })
  }

  // 缩略图一次只截一张（无头浏览器同时开的页面有限，别挤掉体检）
  let chain = Promise.resolve()
  const making = new Map()
  function makeThumb(w, d, file) {
    if (making.has(file)) return making.get(file)
    const job = chain.then(async () => {
      const browser = studio.browser
      if (!browser) throw new Error('no browser')
      const { origin } = await open({ kind: 'file', root: w.dir, file: path.join(w.dir, d.first) })
      const [vw, vh] = KIND_SIZE[d.kind] || KIND_SIZE.web
      const scale = Math.min(1, 480 / vw)
      const jpg = await browser.withPage({ url: `${origin}/${encodeURIComponent(d.first)}`, w: vw, h: Math.min(vh, Math.round(vw * 1.25)), scale, offline: library.strictRoot(w.dir) }, async (page) => {
        await prepare(page, false)
        return page.shot({ quality: 70 })
      })
      fs.mkdirSync(thumbDir, { recursive: true })
      fs.writeFileSync(file + '.tmp', jpg)
      fs.renameSync(file + '.tmp', file)
      return file
    })
    chain = job.catch(() => {})
    making.set(file, job)
    job.finally(() => making.delete(file)).catch(() => {})
    return job
  }

  async function workthumb(req, res) {
    if (!admit(req, res)) return
    const id = new URL(req.url, 'http://x').searchParams.get('id') || ''
    const w = /^[0-9a-f]{16}$/.test(id) ? byId(id) : null
    if (!w) return json(res, 404, { error: 'no such work' })
    const d = describeWork(w)
    if (!d.exists || !d.first || !d.thumb) return json(res, 404, { error: 'no screens' })
    const file = path.join(thumbDir, `${d.id}-${d.thumb}.jpg`)
    if (!fs.existsSync(file)) {
      try {
        await makeThumb(w, d, file)
        // 旧版本的缩略图清掉
        for (const f of fs.readdirSync(thumbDir)) if (f.startsWith(d.id + '-') && f !== path.basename(file)) fs.rmSync(path.join(thumbDir, f), { force: true })
      } catch (e) {
        log(e)
        return json(res, 503, { error: 'thumb failed' })
      }
    }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' })
    fs.createReadStream(file).on('error', () => res.end()).pipe(res)
  }

  async function pack(req, res) {
    if (!admit(req, res)) return
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
    let body
    try { body = await readBody(req) } catch (e) { return json(res, 400, { error: e.message }) }
    // 只打包作品库里的、或者某个会话正在预览的设计目录
    const dir = path.resolve(String(body.dir || ''))
    const snap = body.session ? tracker.snapshot(String(body.session)) : null
    const open = snap && snap.target && snap.target.kind === 'file' && path.resolve(snap.target.root) === dir
    if (!open && !byDir(dir)) return json(res, 404, { error: 'not a design here' })
    const screens = allScreens(dir) // 打包按整套算：屏数超了要明确报，不能悄悄少几屏
    if (!screens.length) return json(res, 400, { error: 'noScreens' })
    const license = body.license === 'CC-BY-4.0' ? 'CC-BY-4.0' : 'CC0-1.0'
    let p
    try {
      p = packDesign(dir, { screens, version, license, author: license === 'CC-BY-4.0' ? String(body.author || '') : '', mode: 'zip', lang: lang(body) })
    } catch (e) {
      log(e)
      return json(res, 500, { error: e.message })
    }
    const flags = [...p.flags]
    flags.sort((a, b) => Number(PERSONAL_CODES.has(b.code)) - Number(PERSONAL_CODES.has(a.code))) // 个人信息的提醒排最前面
    const out = { ok: p.ok, errors: p.errors.slice(0, 60), more: Math.max(0, p.errors.length - 60), flags: flags.slice(0, 30), flagsMore: Math.max(0, flags.length - 30), notes: p.notes.filter((x) => x.code !== 'aiPhoto').slice(0, 60), aiPhotos: p.notes.filter((x) => x.code === 'aiPhoto').length, skipped: p.skipped, bytes: p.bytes, title: p.manifest.title, screens: p.manifest.screens.length }
    if (!p.ok) return json(res, 200, out)
    try {
      fs.mkdirSync(downloads, { recursive: true })
      const t = p.manifest.title
      const stem = slugOf(t.zh || t.en || path.basename(dir), 'design')
      let file = path.join(downloads, `${stem}.zip`)
      for (let i = 2; fs.existsSync(file) && i < 100; i++) file = path.join(downloads, `${stem}-${i}.zip`)
      const zip = zipOf(p)
      fs.writeFileSync(file, zip, { flag: 'wx' })
      exported.add(file)
      json(res, 200, { ...out, path: file })
    } catch (e) {
      log(e)
      json(res, 500, { error: e.message })
    }
  }

  async function usezip(req, res) {
    if (!admit(req, res)) return
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
    let body
    try { body = await readBody(req, MAX_ZIP_BODY) } catch (e) { return json(res, 400, { error: e.message === 'too large' ? 'big' : e.message }) }
    const session = String(body.session || '')
    if (!session) return json(res, 400, { error: '缺 session' })
    const buf = Buffer.from(String(body.data || ''), 'base64')
    let prepared
    try {
      const { files } = readZip(buf)
      prepared = preparePack(files, { lang: lang(body) })
    } catch (e) {
      if (e instanceof ZipError) return json(res, 400, { error: 'zip', code: e.code, x: e.x })
      if (e instanceof UseError) return json(res, 400, { error: e.message, errors: (e.errors || []).slice(0, 40), more: Math.max(0, (e.errors || []).length - 40) })
      log(e)
      return json(res, 500, { error: e.message })
    }
    try {
      const name = String(body.name || '').replace(/\.zip$/i, '')
      const t = prepared.manifest.title
      const r = installPack(prepared, {
        base: baseFor(await sessionCwd(session)),
        name: (t && (t.zh || t.en)) || name,
        trust: 'zip',
        from: { zip: [...name].slice(0, 80).join('') || 'design.zip' },
        library,
      })
      await tracker.setTarget(session, { kind: 'file', file: r.first, root: r.dir }, { source: 'user', popup: false, kind: prepared.manifest.kind, size: prepared.manifest.size || '' })
      json(res, 200, { snap: tracker.snapshot(session), dir: r.dir, title: t, screens: r.screens, license: prepared.manifest.license, kind: prepared.manifest.kind, flags: prepared.flags.slice(0, 20) })
    } catch (e) {
      log(e)
      json(res, 500, { error: e.message })
    }
  }

  return { works, workthumb, pack, usezip }
}
