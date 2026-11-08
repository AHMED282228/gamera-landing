import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('C:/Users/AHMED/Desktop/VideoWeb/package.json')
const { chromium } = require('playwright')
const [URL_, OUT] = process.argv.slice(2)
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ channel: 'chrome' })
for (const s of [{ n: 'w1440', w: 1440, h: 900 }, { n: 'm390', w: 390, h: 844, m: true }]) {
  const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m })
  const p = await ctx.newPage()
  await p.goto(URL_, { waitUntil: 'load' })
  await p.evaluate(() => document.getElementById('coverage').scrollIntoView({ block: 'start' }))
  await p.waitForTimeout(400)
  await p.mouse.wheel(0, 200); await p.waitForTimeout(300); await p.mouse.wheel(0, -200)
  await p.waitForTimeout(2600)
  await p.locator('#coverage').screenshot({ path: `${OUT}/${s.n}-cov.png` })
  await p.fill('#cov-q', 'гатч')
  await p.waitForTimeout(500)
  await p.locator('.cov').screenshot({ path: `${OUT}/${s.n}-cov-q.png` })
  for (const q of ['Новгород', 'Хрюкино', 'питер', 'вырица', 'купчино']) {
    await p.fill('#cov-q', q); await p.waitForTimeout(150)
    console.log(s.n, q, '→', (await p.locator('.cov-search__res').innerText()).replace(/\s+/g, ' '))
  }
  await ctx.close()
}
await b.close()
