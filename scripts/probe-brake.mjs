/**
 * Замер торможения промотки после одного щелчка колеса — в настоящем Chrome,
 * по тому, что на экране: какие кадры стоят в двух слоях и какая прозрачность
 * у верхнего. Окон не открывает.
 *
 * Что печатает (среднее по нескольким щелчкам вниз и вверх):
 *   замерла    — через сколько после щелчка картинка перестаёт меняться;
 *   двоение    — сколько времени на экране смесь двух кадров заметной долей
 *                (верхний слой от 15 до 85%) — это и есть «смаз» на дворниках;
 *   смены      — промежутки между последними сменами кадра, мс (ритм торможения).
 *
 *   node scripts/probe-brake.mjs [--url http://localhost:4321]
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')
const FPS = 24

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(URL_, { waitUntil: 'load' })
await page.waitForFunction(
  () => {
    const v = document.querySelector('.scrub-stage-media video:not([loop]):not(.scrub-blend)')
    return v && v.readyState >= 2
  },
  null,
  { timeout: 30000 },
)

// В середину сцены, затем ждём, пока второй слой (растворение) подключится.
await page.evaluate(() => {
  const s = document.querySelector('.scrub-section')
  const top = s.getBoundingClientRect().top + scrollY
  scrollTo(0, top + 0.3 * (s.offsetHeight - innerHeight))
})
await page.mouse.move(720, 450)
const ready = await page
  .waitForFunction(() => {
    const b = document.querySelector('.scrub-blend')
    return b && b.readyState >= 2
  }, null, { timeout: 30000 })
  .then(() => true, () => false)
await page.waitForTimeout(2500)

const shots = []
for (const dy of [100, 100, -100, 100, -100, -100]) {
  await page.evaluate(() => {
    const a = document.querySelector('.scrub-stage-media video:not([loop]):not(.scrub-blend)')
    const b = document.querySelector('.scrub-blend')
    window.__rec = []
    const t0 = performance.now()
    const loop = () => {
      const op = b ? Number(getComputedStyle(b).opacity) : 0
      window.__rec.push([performance.now() - t0, a.currentTime, b ? b.currentTime : 0, op])
      if (performance.now() - t0 < 2500) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  await page.mouse.wheel(0, dy)
  await page.waitForTimeout(2700)
  shots.push(await page.evaluate(() => window.__rec))
}
await browser.close()

const res = shots.map((rec) => {
  const img = rec.map(([t, a, b, op]) => {
    const fa = Math.floor(a * FPS + 1e-6)
    const fb = Math.floor(b * FPS + 1e-6)
    return { t: t / 1000, x: Math.abs(fa - fb) === 1 ? fa + op * (fb - fa) : op > 0.5 ? fb : fa, op, adj: Math.abs(fa - fb) === 1 }
  })
  const end = img[img.length - 1].x
  const start = img.findIndex((r) => Math.abs(r.x - img[0].x) > 0.01)
  const t0 = start > 0 ? img[start - 1].t : 0
  let still = 0
  for (const r of img) if (Math.abs(r.x - end) > 0.01) still = r.t
  let ghost = 0
  for (let i = 1; i < img.length; i++) if (img[i].adj && img[i].op > 0.15 && img[i].op < 0.85) ghost += img[i].t - img[i - 1].t
  const cross = []
  for (let i = 1; i < img.length; i++) if (Math.floor(img[i].x + 0.5) !== Math.floor(img[i - 1].x + 0.5)) cross.push(img[i].t)
  const gaps = cross.slice(-4).map((c, j, s) => (j ? Math.round((c - s[j - 1]) * 1000) : null)).filter((x) => x !== null)
  // скорость картинки (кадров/с) около 0,1 с до замирания: «резко» — когда она ещё большая
  const win = img.filter((r) => r.t > still - 0.15 && r.t <= still - 0.05)
  const v100 = win.length > 1 ? Math.abs(win[win.length - 1].x - win[0].x) / (win[win.length - 1].t - win[0].t) : 0
  return { still: still - t0, ghost, gaps, v100, frames: Math.abs(end - img[0].x) }
})
const avg = (k) => res.reduce((s, r) => s + r[k], 0) / res.length
console.log(`второй слой ${ready ? 'подключён' : 'НЕ подключился — растворения нет'}`)
for (const r of res) console.log(`щелчок: ${r.frames.toFixed(1)} кадра; замерла через ${r.still.toFixed(2)} с; двоение ${r.ghost.toFixed(2)} с; за 0,1 с до замирания ${r.v100.toFixed(1)} кадр/с; смены ${r.gaps.join('/')} мс`)
console.log(`в среднем: замерла через ${avg('still').toFixed(2)} с, двоение ${avg('ghost').toFixed(2)} с, скорость перед замиранием ${avg('v100').toFixed(1)} кадр/с`)
