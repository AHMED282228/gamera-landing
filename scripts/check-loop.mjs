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
await page.waitForTimeout(2500)
const second = show('ещё через 2,5 с:', await probe())

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
  if (loopB && loopB.t <= loopA.t)
    problems.push('время петли не идёт — кадр замер')
}

console.log('')
if (problems.length === 0) {
  console.log('живой первый кадр работает')
} else {
  for (const p of problems) console.log(`✗  ${p}`)
}
process.exit(problems.length === 0 ? 0 : 1)
