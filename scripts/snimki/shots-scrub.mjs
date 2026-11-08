// Снимки сцены с клипом на серединах подписей.
//   node shots-scrub.mjs URL папка
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
const require = createRequire('C:/Users/AHMED/Desktop/VideoWeb/package.json')
const { chromium } = require('playwright')
const [URL_, OUT] = process.argv.slice(2)
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const SIZES = [
  { n: 'w1440', w: 1440, h: 900 },
  { n: 'w1280', w: 1280, h: 720 },
  { n: 'm390', w: 390, h: 844, m: true },
]
const b = await chromium.launch({ channel: 'chrome' })
const errors = []
for (const s of SIZES) {
  const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(`${s.n}: ${m.text()}`))
  p.on('pageerror', (e) => errors.push(`${s.n}: ${e.message}`))
  await p.goto(URL_, { waitUntil: 'load' })
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${OUT}/${s.n}-0-hero.png` })
  const sec = await p.evaluate(() => {
    const el = document.querySelector('.scrub-section')
    return { top: el.offsetTop, h: el.offsetHeight - innerHeight }
  })
  for (const k of [0.22, 0.51, 0.82]) {
    await p.evaluate((y) => window.scrollTo(0, y), Math.round(sec.top + sec.h * k))
    await p.waitForTimeout(1800)
    await p.screenshot({ path: `${OUT}/${s.n}-1-scrub-${k}.png` })
  }
  await ctx.close()
}
await b.close()
console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок в консоли нет')
