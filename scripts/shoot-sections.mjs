/**
 * Снимает нижние секции — каждую отдельным кадром, на десктопе и на мобильном.
 * Промотка сюда не входит, для неё есть shoot.mjs.
 *
 *   node scripts/shoot-sections.mjs [--url ...]
 */
import { mkdirSync, rmSync } from 'node:fs'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')
const OUT =
  'C:/Temp/claude/c--Users-AHMED-Desktop-VideoWeb/0cfbab2b-cb3c-4203-bc9e-d0adeabff0e6/scratchpad/sections'

const SIZES = [
  { name: 'w1440', width: 1440, height: 900 },
  { name: 'm390', width: 390, height: 844, mobile: true },
]

const PARTS = [
  ['cases', '#cases'],
  ['steps', '#steps'],
  ['coverage', '#coverage'],
  ['call', '#call'],
  ['footer', 'footer'],
  ['header', 'header'],
]

const run = async () => {
  // Чистим папку перед съёмкой — старые кадры неотличимы от свежих.
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome' })

  for (const s of SIZES) {
    const ctx = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: 1,
      isMobile: Boolean(s.mobile),
      hasTouch: Boolean(s.mobile),
    })
    const page = await ctx.newPage()
    await page.goto(URL_, { waitUntil: 'load' })
    await page.waitForTimeout(600)

    for (const [name, sel] of PARTS) {
      const el = page.locator(sel).first()
      await el.scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)
      await el.screenshot({ path: `${OUT}/${s.name}-${name}.png` })
    }

    // Прилипшая панель: снимаем нижнюю часть окна в середине страницы.
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 5))
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/${s.name}-bar.png` })

    await ctx.close()
  }

  await browser.close()
  console.log(`снимки в ${OUT}`)
}

run()
