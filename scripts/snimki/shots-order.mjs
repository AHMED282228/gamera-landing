// Снимки блока «Заказ в боте» на каждом этапе.
//   node shots-order.mjs URL папка [w1440,m390]
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
const require = createRequire('C:/Users/AHMED/Desktop/VideoWeb/package.json')
const { chromium } = require('playwright')
const [URL_, OUT, only] = process.argv.slice(2)
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const SIZES = [
  { n: 'w1440', w: 1440, h: 900 },
  { n: 'w1280', w: 1280, h: 720 },
  { n: 'm390', w: 390, h: 844, m: true },
].filter((s) => !only || only.split(',').includes(s.n))
const WAIT = [2200, 6800, 4000, 1200, 3000]
const b = await chromium.launch({ channel: 'chrome' })
const errors = []
for (const s of SIZES) {
  const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m, deviceScaleFactor: s.m ? 2 : 1 })
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(`${s.n}: ${m.text()}`))
  p.on('pageerror', (e) => errors.push(`${s.n}: ${e.message}`))
  await p.goto(URL_, { waitUntil: 'load' })
  await p.waitForTimeout(1200)
  const tops = await p.evaluate(() =>
    [...document.querySelectorAll('.order-step')].map((el) => el.getBoundingClientRect().top + scrollY),
  )
  // заголовок блока
  await p.evaluate(() => document.getElementById('steps').scrollIntoView({ block: 'start' }))
  await p.waitForTimeout(900)
  await p.screenshot({ path: `${OUT}/${s.n}-0-head.png` })
  for (let i = 0; i < tops.length; i++) {
    // начало этапа чуть выше середины экрана
    await p.evaluate((y) => window.scrollTo(0, y), Math.round(tops[i] - s.h * 0.5))
    await p.waitForTimeout(WAIT[i])
    await p.screenshot({ path: `${OUT}/${s.n}-${i + 1}.png` })
  }
  await ctx.close()
}
await b.close()
console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок в консоли нет')
