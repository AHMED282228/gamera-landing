/**
 * Снимает первый экран и пару точек промотки на нескольких ширинах.
 *
 *   node scripts/shoot.mjs [--url ...] [--stops 0,0.25] [--out папка]
 */
import { mkdirSync, rmSync } from 'node:fs'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')
const STOPS = arg('stops', '0,0.25,0.6').split(',').map(Number)
const OUT = arg(
  'out',
  'C:/Temp/claude/c--Users-AHMED-Desktop-VideoWeb/0cfbab2b-cb3c-4203-bc9e-d0adeabff0e6/scratchpad/shots',
)

const SIZES = [
  { name: 'w1280', width: 1280, height: 800 },
  { name: 'w1440', width: 1440, height: 900 },
  { name: 'w1920', width: 1920, height: 1080 },
  { name: 'm390', width: 390, height: 844, mobile: true },
]

const run = async () => {
  /*
   * Папка чистится перед съёмкой. Иначе прогон с --stops оставляет рядом кадры
   * прошлого запуска, и они выглядят точно так же, как свежие: я уже дважды
   * разбирал «дефект», которого в сборке не было — просто смотрел на снимок
   * недельной давности. Пустая папка гарантирует, что всё увиденное снято
   * из текущей сборки.
   */
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome' })

  for (const s of SIZES) {
    const page = await browser.newPage({
      viewport: { width: s.width, height: s.height },
      isMobile: !!s.mobile,
      hasTouch: !!s.mobile,
    })
    await page.goto(URL_, { waitUntil: 'load' })
    if (s.mobile) await page.touchscreen.tap(s.width / 2, s.height / 2)
    else {
      await page.mouse.move(s.width / 2, s.height / 2)
      await page.mouse.wheel(0, 6)
    }
    await page.waitForFunction(
      () => {
        const v = document.querySelector('.scrub-stage-media video:not([loop])')
        return v && v.readyState >= 2
      },
      null,
      { timeout: 20000 },
    )
    const travel = await page.evaluate(
      () => document.querySelector('.scrub-section').offsetHeight - window.innerHeight,
    )
    for (const p of STOPS) {
      await page.evaluate((y) => window.scrollTo(0, y), travel * p)
      await page.waitForTimeout(900)
      await page.screenshot({ path: `${OUT}/${s.name}-${Math.round(p * 100)}.png` })
    }
    console.log('снято:', s.name)
    await page.close()
  }
  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
