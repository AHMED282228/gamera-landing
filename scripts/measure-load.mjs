/**
 * Замер загрузки сайта в настоящем Chrome без окна, с имитацией связи (как DevTools).
 * Свой сервер ведёт себя как nginx из deploy/: gzip, кэш /media и /_next, перемотка (Range).
 *
 *   node scripts/measure-load.mjs --site имя=папка[@папка_media] [--site ...] [--runs 3] [--out итог.json]
 *
 * На каждую версию, устройство и связь — чистый кэш. Печатает:
 *   первый экран — когда нарисован главный кадр (LCP, норма Google — до 2,5 с);
 *   петля пошла  — когда на первом экране заиграло видео;
 *   прокрутка    — когда файл прокрутки скачан целиком;
 *   всё          — когда сеть затихла; трафик всего и до запуска петли.
 * Серверы живут только пока идёт замер.
 */
import { createServer } from 'node:http'
import { stat, readFile, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, extname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const all = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []))
const one = (n, d) => all(n)[0] ?? d
const RUNS = Number(one('runs', 3))
const OUT = one('out', '')
const ONLY = one('only', '') // например «телефон:4g»

const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon', '.vcf': 'text/vcard' }
const GZ = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.vcf', '.xml'])

function serve(root, media, port) {
  const srv = createServer(async (q, r) => {
    const path = decodeURIComponent(q.url.split('?')[0])
    const base = media && path.startsWith('/media/') ? media : root
    let p = join(base, media && path.startsWith('/media/') ? path.slice(6) : path)
    let s
    try {
      s = await stat(p)
      if (s.isDirectory()) { p = join(p, 'index.html'); s = await stat(p) }
    } catch {
      try { p += '.html'; s = await stat(p) } catch { r.writeHead(404); return r.end() }
    }
    const ext = extname(p)
    const h = { 'content-type': T[ext] || 'application/octet-stream', 'last-modified': s.mtime.toUTCString(), etag: `"${s.size.toString(16)}-${s.mtimeMs.toString(16)}"` }
    h['cache-control'] = path.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : /^\/(media|brand)\//.test(path) ? 'public, max-age=604800' : 'no-cache'
    if (q.headers['if-none-match'] === h.etag) { r.writeHead(304, h); return r.end() }
    if (GZ.has(ext) && s.size >= 1024 && /gzip/.test(q.headers['accept-encoding'] || '')) {
      const body = gzipSync(await readFile(p), { level: 5 })
      r.writeHead(200, { ...h, 'content-encoding': 'gzip', 'content-length': body.length, vary: 'Accept-Encoding' })
      return r.end(body)
    }
    h['accept-ranges'] = 'bytes'
    const m = /bytes=(\d*)-(\d*)/.exec(q.headers.range || '')
    if (m) {
      const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], s.size - 1) : s.size - 1
      r.writeHead(206, { ...h, 'content-range': `bytes ${a}-${b}/${s.size}`, 'content-length': b - a + 1 })
      createReadStream(p, { start: a, end: b }).pipe(r)
    } else {
      r.writeHead(200, { ...h, 'content-length': s.size })
      createReadStream(p).pipe(r)
    }
  })
  return new Promise((ok) => srv.listen(port, () => ok(srv)))
}

// Связь: Мбит/с вниз и вверх, задержка туда-обратно (мс). Значения как в DevTools.
const NETS = {
  wifi: { name: 'Wi-Fi 20 Мбит', down: 20, up: 5, rtt: 20, cap: 120 },
  '4g': { name: '4G 8 Мбит', down: 8.1, up: 1.35, rtt: 165, cap: 150 },
  slow4g: { name: 'слабый 4G 1,4 Мбит', down: 1.44, up: 0.675, rtt: 562.5, cap: 240 },
  '2g': { name: 'почти нет связи 0,4 Мбит', down: 0.4, up: 0.4, rtt: 2000, cap: 150 },
}
const DEVICES = {
  компьютер: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, cpu: 1, nets: ['wifi', '4g', 'slow4g'] },
  телефон: {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, cpu: 4,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    nets: ['wifi', '4g', 'slow4g', '2g'],
  },
}

const INIT = () => {
  const m = (window.__m = { lcp: [], playing: [] })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) m.lcp.push({ t: e.startTime, el: e.element ? e.element.tagName + '.' + (e.element.className || '') : '', url: e.url || '' })
  }).observe({ type: 'largest-contentful-paint', buffered: true })
  document.addEventListener('playing', (e) => {
    const v = e.target, r = v.getBoundingClientRect()
    m.playing.push({ t: performance.now(), top: r.top + scrollY, loop: v.loop, cls: v.className, src: v.currentSrc || v.src })
  }, true)
  addEventListener('load', () => (m.load = performance.now()))
  // Для разбора задержки первого экрана: первая отрисовка, когда пришла картинка, занятость процессора.
  m.long = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) m.long.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true })
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime }).observe({ type: 'paint', buffered: true })
  addEventListener('DOMContentLoaded', () => (m.dcl = performance.now()))
}

async function runOnce(browser, url, devName, netKey) {
  const dev = DEVICES[devName], net = NETS[netKey]
  const { cpu, nets, ...ctxOpts } = dev
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  await page.addInitScript(INIT)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: net.rtt,
    downloadThroughput: (net.down * 1e6) / 8, uploadThroughput: (net.up * 1e6) / 8,
    connectionType: 'cellular4g',
  })
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })

  const reqs = new Map()
  let t0 = null, last = 0, inflight = 0, fetching = 0
  const ev = [] // { t, id, bytes }
  cdp.on('Network.requestWillBeSent', (e) => {
    if (t0 === null && e.type === 'Document') t0 = e.timestamp
    const range = /bytes=(\d*)-/.exec(e.request.headers.Range || e.request.headers.range || '')
    reqs.set(e.requestId, { url: e.request.url, type: e.type, start: e.timestamp, from: range ? +range[1] || 0 : 0, got: 0, wire: 0 })
    inflight++; last = e.timestamp
    // fetch(), который сайт читает в blob (клип сцены ниже первого экрана), Chrome не отчитывает
    // кусками (dataReceived) — только в конце. Пока такой запрос идёт, сеть не «затихла».
    if (e.type === 'Fetch') fetching++
  })
  cdp.on('Network.responseReceived', (e) => {
    const q = reqs.get(e.requestId); if (!q) return
    const cr = /\/(\d+)$/.exec(e.response.headers['content-range'] || e.response.headers['Content-Range'] || '')
    q.size = cr ? +cr[1] : +(e.response.headers['content-length'] || e.response.headers['Content-Length'] || 0)
    q.status = e.response.status; q.cache = e.response.fromDiskCache || e.response.fromMemoryCache
  })
  cdp.on('Network.dataReceived', (e) => {
    const q = reqs.get(e.requestId); if (!q) return
    q.got += e.dataLength; q.wire += e.encodedDataLength; last = e.timestamp
    ev.push({ t: e.timestamp, id: e.requestId, got: q.got, wire: e.encodedDataLength })
  })
  const end = (e, ok) => {
    const q = reqs.get(e.requestId); if (!q) return
    q.end = e.timestamp; q.ok = ok; inflight--; last = e.timestamp
    if (q.type === 'Fetch') fetching--
    // Завершённый запрос без отчётов по кускам — тело пришло целиком.
    if (ok && q.status >= 200 && q.status < 300 && q.size && q.got < q.size) q.got = q.status === 206 ? q.got : q.size
    if (ok && e.encodedDataLength > q.wire) { ev.push({ t: e.timestamp, id: e.requestId, got: q.got, wire: e.encodedDataLength - q.wire }); q.wire = e.encodedDataLength }
  }
  cdp.on('Network.loadingFinished', (e) => end(e, true))
  cdp.on('Network.loadingFailed', (e) => end(e, false))

  const started = Date.now()
  await page.goto(url, { waitUntil: 'commit' })
  // Ждём, пока сеть затихнет на 5 с (после события load), но не дольше net.cap.
  for (;;) {
    await page.waitForTimeout(500)
    const m = await page.evaluate(() => window.__m).catch(() => null)
    const quietMs = Date.now() - started - (last && t0 ? (last - t0) * 1000 : 0)
    if (m?.load && quietMs > 6000 && fetching <= 0) break
    if (Date.now() - started > net.cap * 1000) break
  }
  const m = await page.evaluate(() => ({ ...window.__m, poster: performance.getEntriesByType('resource').filter((e) => /poster21/.test(e.name)).map((e) => [e.startTime, e.responseEnd])[0], fetchStart: performance.getEntriesByType('navigation')[0]?.fetchStart || 0, et: navigator.connection?.effectiveType || '', vh: innerHeight }))
  await ctx.close()

  // Время сети — от запроса страницы; приводим к часам страницы.
  const rel = (ts) => (ts - t0) * 1000 + m.fetchStart
  const name = (u) => u.replace(/^https?:\/\/[^/]+/, '')
  const hero = m.playing.find((p) => p.loop && p.top < m.vh)
  const lcp = m.lcp.at(-1)
  // Покрытие файла прокрутки и петли (несколько запросов с Range — объединяем).
  const done = {}
  const cover = {}
  ev.sort((a, b) => a.t - b.t)
  let total = 0
  const before = (ms) => ev.filter((e) => rel(e.t) <= ms).reduce((s, e) => s + e.wire, 0)
  for (const e of ev) {
    total += e.wire
    const q = reqs.get(e.id), u = name(q.url)
    if (!/\.mp4$/.test(u) || !q.size) continue
    const iv = (cover[u] ||= { size: q.size, parts: new Map() })
    iv.parts.set(e.id, [q.from, q.from + e.got])
    if (done[u]) continue
    const parts = [...iv.parts.values()].sort((a, b) => a[0] - b[0])
    let reach = 0
    for (const [a, b] of parts) { if (a > reach) break; reach = Math.max(reach, b) }
    if (reach >= iv.size) done[u] = rel(e.t)
  }
  const files = {}, last2 = {}
  for (const q of reqs.values()) {
    const u = name(q.url)
    files[u] = (files[u] || 0) + q.wire
    if (q.wire) last2[u] = Math.max(last2[u] || 0, rel(q.end || last))
  }
  const scrubFile = Object.keys(cover).find((u) => /\/load/.test(u))
  return {
    et: m.et,
    lcp: lcp ? lcp.t : null, lcpEl: lcp ? lcp.el + ' ' + name(lcp.url) : '',
    load: m.load,
    hero: hero ? hero.t : null, heroSrc: hero ? name(hero.src) : '',
    bytesAtHero: hero ? before(hero.t) : null,
    scrub: scrubFile ? done[scrubFile] ?? null : null, scrubFile: scrubFile || '',
    scrubPart: scrubFile ? Math.min(1, Math.max(...[...cover[scrubFile].parts.values()].map((p) => p[1])) / cover[scrubFile].size) : 0,
    quiet: rel(last), total, files, mediaDone: done, mediaLast: last2, fcp: m.fcp, dcl: m.dcl, posterAt: m.poster, longBeforeLcp: m.long.filter(([s]) => lcp && s < lcp.t).reduce((a, [, d]) => a + d, 0),
  }
}

const sites = all('site').map((s) => {
  const [n, rest] = s.split('=')
  const [dir, media] = rest.split('@')
  return { n, dir, media }
})
const servers = []
let port = 4331
for (const s of sites) { s.port = port++; servers.push(await serve(s.dir, s.media, s.port)) }

const med = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); return a.length ? a[Math.floor((a.length - 1) / 2)] : null }
const browser = await chromium.launch({ channel: 'chrome' })
const results = []
try {
  for (const [devName, dev] of Object.entries(DEVICES)) for (const netKey of dev.nets) {
    if (ONLY && ONLY !== `${devName}:${netKey}`) continue
    const runs = netKey === 'wifi' || netKey === '4g' ? RUNS : 1
    for (const s of sites) {
      const rs = []
      for (let i = 0; i < runs; i++) rs.push(await runOnce(browser, `http://localhost:${s.port}/`, devName, netKey))
      const pick = (k) => med(rs.map((r) => r[k]))
      const row = { dev: devName, net: NETS[netKey].name, site: s.n, runs, et: rs[0].et, lcp: pick('lcp'), hero: pick('hero'), scrub: pick('scrub'), quiet: pick('quiet'), total: pick('total'), bytesAtHero: pick('bytesAtHero'), heroSrc: rs[0].heroSrc, scrubFile: rs[0].scrubFile, scrubPart: rs[0].scrubPart, lcpEl: rs[0].lcpEl, files: rs[0].files, mediaDone: rs[0].mediaDone, mediaLast: rs[0].mediaLast, fcp: pick('fcp'), dcl: pick('dcl'), longBeforeLcp: pick('longBeforeLcp'), posterStart: med(rs.map((r) => r.posterAt?.[0])), posterEnd: med(rs.map((r) => r.posterAt?.[1])) }
      results.push(row)
      const f = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1).replace('.', ',') + ' с')
      const mb = (b) => (b == null ? '—' : (b / 1e6).toFixed(2).replace('.', ',') + ' МБ')
      console.log(`${devName.padEnd(9)} ${NETS[netKey].name.padEnd(26)} ${s.n.padEnd(10)} экран ${f(row.lcp).padEnd(7)} петля ${f(row.hero).padEnd(7)} прокрутка ${f(row.scrub).padEnd(7)} всё ${f(row.quiet).padEnd(7)} трафик ${mb(row.total)} (до петли ${mb(row.bytesAtHero)}) [${row.et}] ${row.heroSrc} ${row.scrubFile}${row.scrub == null && row.scrubFile ? ' ' + Math.round(row.scrubPart * 100) + '%' : ''}`)
    }
  }
} finally {
  await browser.close()
  for (const s of servers) s.close()
  if (OUT) await writeFile(OUT, JSON.stringify(results, null, 1))
}
