/**
 * Проверяет, что живой первый кадр действительно доехал и играет.
 *
 * Глазами это ненадёжно: слой может стоять на месте, но с нулевой
 * прозрачностью; может быть загружен, но на паузе; может играть, но под
 * закрывающим его слоем промотки. Здесь снимаются все три числа сразу, и через
 * пару секунд ещё раз — чтобы стало видно, что время идёт, а не замерло на
 * первом кадре.
 *
 * Ловушка, ради которой скрипт и появился: с preload="none" браузер не начинает
 * качать файл даже после подстановки адреса — он ждёт запроса на
 * воспроизведение. Если запрос делается только по готовности, получается
 * замкнутый круг, и на экране навсегда остаётся постер. Внешне это выглядит
 * ровно как «петли нет», без единой ошибки в консоли.
 *
 *   node scripts/check-loop.mjs [адрес]
 */
import { chromium } from 'playwright'

const TARGET = process.argv[2] ?? 'http://localhost:3000'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const seen = []
page.on('response', (r) => {
  const path = new globalThis.URL(r.url()).pathname
  if (/\.(mp4|jpg|webp)$/.test(path)) seen.push(path)
})

await page.goto(TARGET, { waitUntil: 'load' })

const probe = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('video')].map((v) => ({
      src: v.currentSrc.replace(/^.*\/media\//, '') || '(без адреса)',
      readyState: v.readyState,
      paused: v.paused,
      t: Number(v.currentTime.toFixed(2)),
      opacity: getComputedStyle(v).opacity,
      loop: v.loop,
    })),
  )

const show = (label, rows) => {
  console.log(`\n${label}`)
  for (const r of rows) {
    console.log(
      `  ${r.src.padEnd(16)} готовность ${r.readyState}  ` +
        `${r.paused ? 'пауза ' : 'играет'}  t=${String(r.t).padStart(5)}  ` +
        `прозрачность ${r.opacity}  зациклено ${r.loop ? 'да' : 'нет'}`,
    )
  }
  return rows
}

await page.waitForTimeout(3000)
const first = show('через 3 с после загрузки:', await probe())
/*
 * Второй замер — через 0,7 с, а не через целое число кругов: круг петли 2,5 с,
 * и замер через 2,5 с попадал в то же место после полного оборота, будто кадр
 * замер. По той же причине проверяем «время сдвинулось», а не «выросло».
 */
await page.waitForTimeout(700)
const second = show('ещё через 0,7 с:', await probe())

/*
 * Стык круга. Атрибут loop на перемотке в начало держал кадр на стыке лишний
 * раз — 67–80 мс вместо 40–53 (замер в Chrome: на 21 стыке из 30), рывок раз в
 * 2,5 с. Теперь круги подкладываются подряд (lib/gaplessLoop.ts): время петли
 * растёт без перемотки, и задержек именно на стыке нет (1 из 30 — не чаще
 * случайных посреди круга).
 *
 * Судим механизм: адрес blob: (подкладка), ни одной перемотки назад. Задержки
 * кадра выводим справкой: встроенный Chromium без экрана сам по себе пропускает
 * обновления экрана (медиана 50 мс вместо 40), и число задержек по нему — шум.
 * Точный замер — в настоящем Chrome (chromium.launch({ channel: 'chrome' })).
 */
const gap = await page.evaluate(
  () =>
    new Promise((res) => {
      const v = [...document.querySelectorAll('video')].find((x) => x.loop)
      // Длина круга — из самого файла: у подкладки duration растёт с каждым кругом.
      const file = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => /\/loop(21)?_\d+\.mp4$/.test(n))
      const probe = document.createElement('video')
      probe.preload = 'metadata'
      probe.muted = true
      const L0 = new Promise((ok) => {
        probe.onloadedmetadata = () => ok(probe.duration)
        probe.onerror = () => ok(NaN)
        setTimeout(() => ok(NaN), 3000)
      })
      probe.src = file ?? ''
      const log = []
      const t0 = performance.now()
      const cb = async (now, md) => {
        log.push([now, md.mediaTime])
        if (now - t0 < 10000) return void v.requestVideoFrameCallback(cb)
        const L = await L0
        const dts = log.slice(1).map((r, i) => r[0] - log[i][0])
        const back = log.slice(1).filter((r, i) => r[1] < log[i][1]).length
        // Кадр на стыке — первый кадр нового круга (фаза в пределах полукадра от нуля).
        const atSeam = (i) => {
          const ph = ((log[i + 1][1] % L) + L) % L
          return ph < 0.02 || L - ph < 0.02
        }
        const ok = Number.isFinite(L)
        res({
          mse: v.currentSrc.startsWith('blob:'),
          long: dts.filter((d) => d >= 60).length,
          frames: dts.length,
          seams: ok ? dts.filter((d, i) => atSeam(i)).length : '?',
          seamLong: ok ? dts.filter((d, i) => d >= 60 && atSeam(i)).length : '?',
          L: ok ? Number(L.toFixed(2)) : '?',
          max: Math.round(Math.max(...dts)),
          back,
          t: Number(v.currentTime.toFixed(2)),
        })
      }
      v.requestVideoFrameCallback(cb)
    }),
)
console.log(
  `\nстык круга за 10 с (круг ${gap.L} с): подкладка ${gap.mse ? 'да' : 'нет (обычный повтор)'}, ` +
    `перемоток назад ${gap.back}, время петли ${gap.t} с\n` +
    `  справка: задержек кадра от 60 мс на стыках ${gap.seamLong} из ${gap.seams}, ` +
    `всего ${gap.long} из ${gap.frames} кадров (самая долгая ${gap.max} мс)`,
)

console.log('\nзапрошенные медиафайлы:')
for (const p of [...new Set(seen)]) console.log(`  ${p}`)

// --- вердикт ---------------------------------------------------------------
const loopA = first.find((r) => r.loop)
const loopB = second.find((r) => r.loop)
const problems = []

if (!loopA) problems.push('слоя петли нет в разметке')
else {
  if (loopA.src === '(без адреса)') problems.push('петле не подставлен адрес')
  if (loopA.readyState < 2) problems.push('петля не загрузилась')
  if (loopA.paused) problems.push('петля на паузе')
  if (Number(loopA.opacity) < 1) problems.push('петля прозрачна')
  if (loopB && loopB.t === loopA.t)
    problems.push('время петли не идёт — кадр замер')
  if (!gap.mse) problems.push('круг крутится обычным повтором — на стыке будет рывок')
  if (gap.back > 0) problems.push('петля перематывается в начало — на стыке будет рывок')
}

console.log('')
if (problems.length === 0) {
  console.log('живой первый кадр работает')
} else {
  for (const p of problems) console.log(`✗  ${p}`)
}
process.exit(problems.length === 0 ? 0 : 1)
