// Первый экран: петля запустилась? (Chrome — в нём есть H.264)
import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ channel: 'chrome', headless: true })
for (const [name, vp] of [['pc', { width: 1440, height: 900 }], ['tel', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  for (let k = 0; ; k++) { try { await p.goto('http://localhost:4322', { waitUntil: 'load' }); break } catch (e) { if (k > 30) throw e; await p.waitForTimeout(500) } }
  await p.waitForTimeout(5000)
  const v = await p.evaluate(() => { const v = document.querySelector('.hero-static video'); return { t: +v.currentTime.toFixed(2), paused: v.paused, op: v.style.opacity } })
  await p.screenshot({ path: `${out}/hero-${name}.jpg`, quality: 55 })
  console.log(name, JSON.stringify(v), 'ошибки:', errs.length ? errs : 'нет')
  await p.close()
}
await b.close()
