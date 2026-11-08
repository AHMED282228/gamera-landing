/**
 * Карта яркости чистого видеокадра — без затемнений.
 * Нужна, чтобы класть текст и градиенты по фактическим замерам, а не на глаз.
 *
 *   node scripts/measure-frame.mjs [--url ...] [--cols 20] [--rows 10]
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}

const URL_ = arg('url', 'http://localhost:4321')
const COLS = Number(arg('cols', 20))
const ROWS = Number(arg('rows', 10))
const STOPS = (arg('stops', '0,0.25,0.5,0.9') || '').split(',').map(Number)

const MAP = `
(async ({ dataUrl, cols, rows }) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const grid = []
  const cw = Math.floor(img.width / cols)
  const ch = Math.floor(img.height / rows)
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let k = 0; k < cols; k++) {
      const d = ctx.getImageData(k * cw, r * ch, cw, ch).data
      let peak = 0, sum = 0, n = 0
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.max(d[i], d[i + 1], d[i + 2])
        if (v > peak) peak = v
        sum += (d[i] + d[i + 1] + d[i + 2]) / 3
        n++
      }
      row.push({ peak, mean: Math.round(sum / n) })
    }
    grid.push(row)
  }
  return grid
})
`

const SHADE = ' .:-=+*#%@'
const shade = (v) => SHADE[Math.min(SHADE.length - 1, Math.floor((v / 256) * SHADE.length))]

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(URL_, { waitUntil: 'load' })
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 10)
  await page.waitForFunction(
    () => {
      const v = document.querySelector('.scrub-stage-media video:not([loop])')
      return v && v.readyState >= 2
    },
    null,
    { timeout: 20000 },
  )
  // Снимаем чистый кадр: все затемнения и текст временно убираем.
  await page.addStyleTag({
    content:
      '.scrub-caption,.scrub-hud,.hero-copy,.scrub-scrim-bottom,.scrub-scrim-left{display:none !important}',
  })

  const lab = await browser.newPage()
  await lab.goto('about:blank')

  const geo = await page.evaluate(() => {
    const s = document.querySelector('.scrub-section')
    return {
      top: s.getBoundingClientRect().top + window.scrollY,
      travel: s.offsetHeight - window.innerHeight,
    }
  })

  for (const p of STOPS) {
    await page.evaluate((y) => window.scrollTo(0, y), geo.top + geo.travel * p)
    await page.waitForTimeout(900)
    const shot = await page.screenshot({ type: 'png' })
    const grid = await lab.evaluate(([fn, payload]) => eval(fn)(payload), [
      MAP,
      { dataUrl: 'data:image/png;base64,' + shot.toString('base64'), cols: COLS, rows: ROWS },
    ])

    console.log(`\n=== прогресс ${Math.round(p * 100)}% · пик яркости в клетке (0-255) ===`)
    const header = Array.from({ length: COLS }, (_, i) =>
      String(Math.round((i / COLS) * 100)).padStart(2, ' ').slice(-1),
    ).join('   ')
    console.log('  x%: ' + header)
    grid.forEach((row, r) => {
      const y = Math.round((r / ROWS) * 100)
      const cells = row.map((c) => String(c.peak).padStart(3)).join(' ')
      const art = row.map((c) => shade(c.peak)).join('')
      console.log(`y${String(y).padStart(3)}% ${cells}  |${art}|`)
    })
  }

  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
