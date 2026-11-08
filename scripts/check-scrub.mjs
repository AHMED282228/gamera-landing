/**
 * Проверка ядра: скролл действительно задаёт время клипа, а не проигрывает его.
 *
 * Гоняем настоящий Chrome (channel: 'chrome'), а не сборку Chromium из
 * Playwright: в ней нет H.264, и видео просто не декодируется.
 *
 *   node scripts/check-scrub.mjs [--url http://localhost:4321] [--shots]
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const urlArg = args.indexOf('--url')
const URL_ = urlArg === -1 ? 'http://localhost:4321' : args[urlArg + 1]
const SHOTS = args.includes('--shots')
const OUT =
  'C:/Temp/claude/c--Users-AHMED-Desktop-VideoWeb/0cfbab2b-cb3c-4203-bc9e-d0adeabff0e6/scratchpad/shots'

const STOPS = [0, 0.12, 0.25, 0.4, 0.5, 0.65, 0.8, 0.95, 1]
/** Времени на догоняние прокрутки (lib/useSmoothProgress.ts, ~0,8 с на 15% хода). */
const SETTLE_MS = 900
/** Частота клипа — из lib/config.ts (MEDIA.fps). */
const FPS = 24

/*
 * Клип показывают два слоя (lib/useVideoScrub.ts): нижний — чётные кадры,
 * верхний — нечётные, растворяется поверх. Видимый кадр — тот слой, что
 * перевешивает. Функция уходит в браузер строкой, поэтому самодостаточна.
 */
const SHOWN = `(() => {
  const vs = [...document.querySelectorAll('.scrub-stage-media video:not([loop])')]
  const a = vs[0], b = vs[1]
  const useB = b && b.getAttribute('src') && Number(getComputedStyle(b).opacity) >= 0.5
  const v = useB ? b : a
  return { time: v.currentTime, seeking: vs.some((x) => x.seeking), paused: vs.every((x) => x.paused), ready: a.readyState }
})()`

const fmt = (n, w = 6) => n.toFixed(3).padStart(w)

async function geometry(page) {
  return page.evaluate(() => {
    const section = document.querySelector('.scrub-section')
    const video = document.querySelector('.scrub-stage-media video:not([loop])')
    const rect = section.getBoundingClientRect()
    return {
      sectionTop: rect.top + window.scrollY,
      sectionHeight: section.offsetHeight,
      viewport: window.innerHeight,
      duration: video.duration,
      src: video.currentSrc,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    }
  })
}

async function sampleAt(page, p, g) {
  const travel = g.sectionHeight - g.viewport
  await page.evaluate((y) => window.scrollTo(0, y), g.sectionTop + travel * p)
  await page.waitForTimeout(SETTLE_MS)
  // Ждём, пока перемотка действительно завершится и время перестанет меняться:
  // иначе замер попадает в незавершённый seek и показывает предыдущий кадр,
  // то есть меряет гонку с декодером, а не точность промотки.
  await page
    .waitForFunction(
      (SHOWN) => {
        const s = eval(SHOWN)
        if (s.seeking) return false
        const prev = window.__lastTime
        window.__lastTime = s.time
        return prev !== undefined && Math.abs(prev - s.time) < 1e-4
      },
      SHOWN,
      { timeout: 3000, polling: 100 },
    )
    .catch(() => {})
  await page.evaluate(() => (window.__lastTime = undefined))
  return page.evaluate((SHOWN) => eval(SHOWN), SHOWN)
}

const run = async () => {
  if (SHOTS) mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const requests = []
  page.on('request', (r) => {
    if (/\.(mp4|jpg)$/.test(new URL(r.url()).pathname)) requests.push(r.url())
  })

  await page.goto(URL_, { waitUntil: 'load' })
  // Промотка снимает замок автозапуска по первому жесту — эмулируем его.
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 10)
  await page.waitForFunction(
    () => {
      const v = document.querySelector('.scrub-stage-media video:not([loop])')
      return v && v.readyState >= 2 && Number.isFinite(v.duration)
    },
    null,
    { timeout: 20000 },
  )

  const g = await geometry(page)
  console.log('клип        :', g.src.split('/').pop(), `${g.videoWidth}x${g.videoHeight}`)
  console.log('длительность:', g.duration, 'с')
  console.log('секция      :', g.sectionHeight, 'px, окно', g.viewport, 'px')
  console.log()

  /*
   * Промотка встаёт на целый кадр: позиция p · (кадров − 1), кадр m запрошен
   * серединой (m + 0,5) / fps. Расхождение до полукадра (0,021 с) — это
   * округление до кадра, а не ошибка.
   */
  const frames = Math.round(g.duration * FPS)
  const expectedAt = (p) => (p * (frames - 1) + 0.5) / FPS
  let worst = 0

  console.log('=== ход вперёд ===')
  console.log('прогресс   ожидание   факт    расхождение')
  for (const p of STOPS) {
    const s = await sampleAt(page, p, g)
    const expected = expectedAt(p)
    const diff = Math.abs(s.time - expected)
    worst = Math.max(worst, diff)
    console.log(
      `  ${String(Math.round(p * 100)).padStart(3)}%   ${fmt(expected)}  ${fmt(s.time)}   ${fmt(diff)}  ${s.paused ? 'на паузе' : 'ИГРАЕТ!'}`,
    )
    if (SHOTS) {
      await page.screenshot({ path: `${OUT}/fwd-${String(Math.round(p * 100)).padStart(3, '0')}.png` })
    }
  }

  console.log('\n=== ход назад ===')
  console.log('прогресс   ожидание   факт    расхождение')
  for (const p of [...STOPS].reverse()) {
    const s = await sampleAt(page, p, g)
    const expected = expectedAt(p)
    const diff = Math.abs(s.time - expected)
    worst = Math.max(worst, diff)
    console.log(
      `  ${String(Math.round(p * 100)).padStart(3)}%   ${fmt(expected)}  ${fmt(s.time)}   ${fmt(diff)}`,
    )
  }

  // --- Непрерывность: мелкими шагами колеса, с записью каждого кадра --------
  console.log('\n=== непрерывность на мелком шаге ===')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(SETTLE_MS)

  const trace = await page.evaluate(async (SHOWN) => {
    const samples = []
    let stop = false
    const collect = () => {
      samples.push(eval(SHOWN).time)
      if (!stop) requestAnimationFrame(collect)
    }
    requestAnimationFrame(collect)
    for (let i = 0; i < 60; i++) {
      window.scrollBy(0, 30)
      await new Promise((r) => setTimeout(r, 16))
    }
    await new Promise((r) => setTimeout(r, 600))
    stop = true
    return samples
  }, SHOWN)

  let backsteps = 0
  let maxJump = 0
  for (let i = 1; i < trace.length; i++) {
    const d = trace[i] - trace[i - 1]
    if (d < -1e-6) backsteps++
    maxJump = Math.max(maxJump, Math.abs(d))
  }
  console.log('  кадров записано      :', trace.length)
  console.log('  ход назад при скролле вниз:', backsteps)
  console.log('  максимальный скачок  :', maxJump.toFixed(4), 'с')

  const mp4s = [...new Set(requests.filter((u) => u.endsWith('.mp4')))]
  console.log('\n=== загруженные клипы ===')
  mp4s.forEach((u) => console.log('  ', u.split('/').pop()))

  console.log('\nхудшее расхождение по всем остановкам:', worst.toFixed(4), 'с')
  await browser.close()

  const failures = []
  if (worst > 0.05) failures.push(`расхождение ${worst.toFixed(4)}с больше кадра`)
  if (backsteps > 0) failures.push(`${backsteps} откатов времени при скролле вниз`)
  // Петля первого экрана — отдельный слой, её проверяет check-loop.mjs.
  const scrubs = mp4s.filter((u) => !/^loop(21)?_/.test(u.split('/').pop()))
  if (scrubs.length !== 1) failures.push(`загружено клипов промотки: ${scrubs.length}, ожидался 1`)
  if (failures.length) {
    console.log('\nПРОВАЛ: ' + failures.join('; '))
    process.exit(1)
  }
  console.log('\nвсё сошлось')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
