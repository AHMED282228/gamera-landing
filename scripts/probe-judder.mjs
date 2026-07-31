/**
 * Разбирает, из чего складывается дёрганье промотки.
 *
 * Мерить на глаз тут бесполезно: «дёргается» одинаково выглядит и когда время
 * назначается рвано, и когда назначается ровно, а показать нечего. Поэтому
 * пишем два потока сразу — сколько раз код попросил перемотку и какие кадры
 * браузер на самом деле предъявил. Второе даёт requestVideoFrameCallback: он
 * зовётся ровно на предъявленный кадр и приносит его mediaTime.
 *
 * Главная строка отчёта — последняя, распределение шага в кадрах исходника.
 * Если там вперемешку единицы и двойки, картинка скачет то на кадр, то на два,
 * и это видно как рывки. Лечится только частотой самого клипа: промотка не
 * может показать то, чего в файле нет.
 *
 *   node scripts/probe-judder.mjs [--url http://localhost:4321] [--fps 24]
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')
const SRC_FPS = Number(arg('fps', 24))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(URL_, { waitUntil: 'load' })
await page.waitForFunction(
  () => {
    const v = document.querySelector('.scrub-stage-media video')
    return v && v.readyState >= 2
  },
  null,
  { timeout: 30000 },
)

const geo = await page.evaluate(() => {
  const s = document.querySelector('.scrub-section')
  return { top: s.getBoundingClientRect().top + window.scrollY, h: s.offsetHeight }
})

await page.evaluate(() => {
  const v = document.querySelector('.scrub-stage-media video')
  window.__frames = []
  window.__seeks = []
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')
  Object.defineProperty(v, 'currentTime', {
    get() {
      return desc.get.call(this)
    },
    set(val) {
      window.__seeks.push(performance.now())
      desc.set.call(this, val)
    },
  })
  const step = (_now, meta) => {
    window.__frames.push({ t: performance.now(), media: meta.mediaTime })
    v.requestVideoFrameCallback(step)
  }
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step)
  else window.__noRvfc = true
})

// Плавная прокрутка примерно как колесом: небольшими шагами.
await page.evaluate(async ({ top, h }) => {
  window.__frames.length = 0
  window.__seeks.length = 0
  const from = top
  const to = top + h * 0.55
  const steps = 60
  for (let k = 0; k <= steps; k++) {
    window.scrollTo(0, from + ((to - from) * k) / steps)
    await new Promise((r) => setTimeout(r, 16))
  }
  await new Promise((r) => setTimeout(r, 1200))
}, geo)

const data = await page.evaluate(() => ({
  frames: window.__frames,
  seeks: window.__seeks,
  noRvfc: window.__noRvfc ?? false,
}))
await browser.close()

if (data.noRvfc) {
  console.log('браузер не умеет requestVideoFrameCallback — замер невозможен')
  process.exit(0)
}

const gaps = []
for (let k = 1; k < data.frames.length; k++) gaps.push(data.frames[k].t - data.frames[k - 1].t)
gaps.sort((a, b) => a - b)

const steps = []
for (let k = 1; k < data.frames.length; k++) {
  const d = data.frames[k].media - data.frames[k - 1].media
  if (d > 1e-4) steps.push(d)
}

const frameDur = 1 / SRC_FPS
const hist = new Map()
for (const s of steps) {
  const k = Math.max(1, Math.round(s / frameDur))
  hist.set(k, (hist.get(k) ?? 0) + 1)
}
const keys = [...hist.keys()].sort((a, b) => a - b)
/** Доля шагов не самой частой длины — грубая мера неровности хода. */
const top = Math.max(...hist.values())
const uneven = steps.length ? 1 - top / steps.length : 0

console.log(`запросов перемотки : ${data.seeks.length}`)
console.log(`предъявлено кадров : ${data.frames.length}, из них с новой картинкой ${steps.length}`)
console.log(
  `промежуток между кадрами: медиана ${(gaps[gaps.length >> 1] ?? 0).toFixed(1)} мс, худший ${(gaps[gaps.length - 1] ?? 0).toFixed(1)} мс`,
)
console.log('')
console.log(`шаг в кадрах исходника (${SRC_FPS} к/с):`)
for (const k of keys) console.log(`  на ${k} кадр(а): ${hist.get(k)} раз`)
console.log('')
console.log(`неровность хода: ${Math.round(uneven * 100)}% шагов выбиваются из основного`)
