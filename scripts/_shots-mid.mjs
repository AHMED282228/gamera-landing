// Снимки варианта «клип в середине»: первый экран, ленты, полоса глав, клип.
import { chromium } from 'playwright'
const url = process.argv[2] ?? 'http://localhost:4322'
const out = process.argv[3] ?? '.'
const b = await chromium.launch()
for (const [name, vp] of [['pc', { width: 1440, height: 900 }], ['tel', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${out}/${name}-1-top.jpg`, quality: 60 })
  const at = async (sel, dy, tag) => {
    await p.evaluate(([s, d]) => {
      const el = document.querySelector(s)
      scrollTo(0, el.getBoundingClientRect().top + scrollY + d)
    }, [sel, dy])
    await p.waitForTimeout(900)
    await p.screenshot({ path: `${out}/${name}-${tag}.jpg`, quality: 60 })
  }
  await at('.tape-x', -vp.height / 2 + 120, '2-tape')
  await at('#steps', 0, '3-chapters')
  await at('#loading', vp.height * 1.6, '4-clip')
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  console.log(name, 'горизонт. прокрутка:', sw, 'ошибки:', errs.length ? errs : 'нет')
  await p.close()
}
await b.close()
