/**
 * Замер читаемости: берём фон под текстом и считаем реальный контраст к цвету
 * текста, а не смотрим глазами на макет.
 *
 * Подписи и HUD на время съёмки прячем — нас интересует именно подложка.
 * Разбор пикселей делает сам браузер через canvas, чтобы не тащить в проект
 * ещё одну библиотеку ради этого.
 *
 *   node scripts/check-legibility.mjs [--url ...] [--width 1440]
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

const URL_ = arg('url', 'http://localhost:4321')
const WIDTH = Number(arg('width', 1440))
const HEIGHT = Number(arg('height', 900))

/** Цвет текста HUD-зоны — токен --ink. */
const INK = [0xed, 0xed, 0xea]
/**
 * Буквы подписей на компьютере видны только в свете фары и красятся тёплым
 * (components/scrub/HeadlightWindow.tsx → LIT). Берём более тёмный из двух —
 * абзац #e9e1d5: если проходит он, заголовок проходит тем более.
 */
const LIT = [0xe9, 0xe1, 0xd5]

/**
 * Зоны берём не на глаз, а по фактическим границам элементов из DOM: раскладка
 * меняется, и зашитые доли окна начинают мерить не то место. Немного расширяем
 * рамку, чтобы поймать подложку и вокруг букв.
 */
const TARGETS = [
  { name: 'подпись', selector: '.scrub-caption', ink: LIT },
]
const PAD = 6

const STOPS = [0.1, 0.2, 0.3, 0.5, 0.75, 0.9]

const ANALYZER = `
(async ({ dataUrl, regions }) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)

  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return regions.map((rg) => {
    const inkLum = lum(rg.ink[0], rg.ink[1], rg.ink[2])
    const ratio = (l) => (Math.max(inkLum, l) + 0.05) / (Math.min(inkLum, l) + 0.05)
    const x = Math.max(0, Math.round(rg.x))
    const y = Math.max(0, Math.round(rg.y))
    const w = Math.min(img.width - x, Math.round(rg.w))
    const h = Math.min(img.height - y, Math.round(rg.h))
    if (w <= 0 || h <= 0) return { name: rg.name, worst: Infinity, meanByte: 0, peakByte: 0 }
    const d = ctx.getImageData(x, y, w, h).data
    let worst = Infinity, sum = 0, n = 0, peak = 0
    for (let i = 0; i < d.length; i += 4) {
      const l = lum(d[i], d[i + 1], d[i + 2])
      const r = ratio(l)
      if (r < worst) worst = r
      if (l > peak) peak = l
      sum += l
      n++
    }
    const toByte = (l) => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055))
    return { name: rg.name, worst, meanByte: toByte(sum / n), peakByte: toByte(peak) }
  })
})
`

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
  await page.goto(URL_, { waitUntil: 'load' })
  await page.mouse.move(WIDTH / 2, HEIGHT / 2)
  await page.mouse.wheel(0, 10)
  await page.waitForFunction(
    () => {
      const v = document.querySelector('.scrub-stage-media video:not([loop])')
      return v && v.readyState >= 2
    },
    null,
    { timeout: 20000 },
  )
  const rects = await page.evaluate(
    ([targets, pad]) =>
      targets
        .map((t) => {
          const el = document.querySelector(t.selector)
          if (!el) return null
          // Меряем по строкам текста, а не по растянутой на всю ширину коробке.
          const range = document.createRange()
          range.selectNodeContents(el)
          const r = range.getBoundingClientRect()
          const box = r.width > 0 ? r : el.getBoundingClientRect()
          return {
            name: t.name,
            ink: t.ink,
            x: box.left - pad,
            y: box.top - pad,
            w: box.width + pad * 2,
            h: box.height + pad * 2,
          }
        })
        .filter(Boolean),
    [TARGETS, PAD],
  )
  console.log('замеряемые зоны (по факту из вёрстки):')
  rects.forEach((r) =>
    console.log(
      `  ${r.name.padEnd(9)} x ${Math.round(r.x)}…${Math.round(r.x + r.w)}, y ${Math.round(r.y)}…${Math.round(r.y + r.h)}`,
    ),
  )
  console.log()

  // Прячем сам текст: меряем подложку, а не буквы поверх неё.
  await page.addStyleTag({
    content: '.scrub-caption, .hero-copy { visibility: hidden !important; }',
  })

  const lab = await browser.newPage()
  await lab.goto('about:blank')

  const geo = await page.evaluate(() => {
    const s = document.querySelector('.scrub-section')
    return { top: s.getBoundingClientRect().top + window.scrollY, travel: s.offsetHeight - window.innerHeight }
  })

  console.log(`ширина окна ${WIDTH}px · подписи #E9E1D5 (буквы в свете), HUD --ink #EDEDEA · порог 4.5\n`)
  console.log('прогресс  зона                худший контраст   средний фон   пик фона')

  let worstOverall = Infinity
  for (const p of STOPS) {
    await page.evaluate((y) => window.scrollTo(0, y), geo.top + geo.travel * p)
    await page.waitForTimeout(900)
    const shot = await page.screenshot({ type: 'png' })
    const dataUrl = 'data:image/png;base64,' + shot.toString('base64')
    const res = await lab.evaluate(
      ([fn, payload]) => eval(fn)(payload),
      [ANALYZER, { dataUrl, regions: rects }],
    )
    for (const r of res) {
      worstOverall = Math.min(worstOverall, r.worst)
      const mark = r.worst >= 4.5 ? 'ok' : '!!'
      console.log(
        `   ${String(Math.round(p * 100)).padStart(3)}%  ${r.name.padEnd(18)}` +
          `${r.worst.toFixed(2).padStart(8)} ${mark}      ` +
          `${String(r.meanByte).padStart(4)}/255   ${String(r.peakByte).padStart(4)}/255`,
      )
    }
  }

  console.log(`\nхудший контраст по всем замерам: ${worstOverall.toFixed(2)}`)
  await browser.close()
  if (worstOverall < 4.5) {
    console.log('ПРОВАЛ: подложка местами слишком светлая под текстом')
    process.exit(1)
  }
  console.log('читаемость в норме')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
