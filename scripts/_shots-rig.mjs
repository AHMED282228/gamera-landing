// Снимки блока «Наш эвакуатор»: общий вид, открытая деталь (ПК и телефон).
import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch()
for (const [name, vp, pick] of [['pc', { width: 1440, height: 900 }, 3], ['tel', { width: 390, height: 844 }, 2]]) {
  const p = await b.newPage({ viewport: vp })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  for (let k = 0; ; k++) { try { await p.goto('http://localhost:4322', { waitUntil: 'networkidle' }); break } catch (e) { if (k > 30) throw e; await p.waitForTimeout(500) } }
  await p.evaluate(() => document.querySelector('.rig').scrollIntoView({ block: 'start' }))
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `${out}/rig-${name}-1.jpg`, quality: 55 })
  await p.locator('.rig__item').nth(pick).click(); await p.evaluate(() => document.querySelector('.rig').scrollIntoView({ block: 'start' }))
  await p.waitForTimeout(1800)
  await p.screenshot({ path: `${out}/rig-${name}-2.jpg`, quality: 55 })
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  console.log(name, 'вбок:', sw, 'ошибки:', errs.length ? errs : 'нет')
  await p.close()
}
await b.close()
