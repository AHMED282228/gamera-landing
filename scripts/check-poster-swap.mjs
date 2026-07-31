/**
 * Подмена постера на видео должна быть незаметной.
 *
 * Снимаем первый экран дважды: с заблокированным клипом (виден постер) и после
 * его загрузки (виден первый кадр). Постер вырезан из этого же кадра, поэтому
 * разница обязана быть на уровне шума JPEG, а геометрия — совпадать.
 *
 * Совпадение геометрии проверяем честно: считаем расхождение не только при
 * нулевом смещении, но и при сдвигах на ±1 и ±2 пикселя. Если картинки
 * выровнены, минимум обязан приходиться ровно на ноль.
 *
 *   node scripts/check-poster-swap.mjs [--url ...]
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')

const DIFF = `
(async ({ a, b, offsets }) => {
  const load = async (src) => {
    const img = new Image(); img.src = src; await img.decode(); return img
  }
  const [ia, ib] = await Promise.all([load(a), load(b)])
  const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height)
  const grab = (img) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d', { willReadFrequently: true })
    x.drawImage(img, 0, 0)
    return x.getImageData(0, 0, w, h).data
  }
  const da = grab(ia), db = grab(ib)

  const compare = (dx) => {
    let sum = 0, n = 0, over8 = 0, peak = 0
    // Поля по краям пропускаем, чтобы сдвиг не сравнивался с пустотой.
    for (let y = 4; y < h - 4; y++) {
      for (let x = 4; x < w - 4; x++) {
        const ia_ = (y * w + x) * 4
        const ib_ = (y * w + x + dx) * 4
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(da[ia_ + k] - db[ib_ + k])
          sum += d; n++
          if (d > peak) peak = d
          if (d > 8) over8++
        }
      }
    }
    return { dx, mean: sum / n, over8: (100 * over8) / n, peak }
  }
  return offsets.map(compare)
})
`

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const shots = {}

  // --- 1. Клип заблокирован: на экране обязан остаться постер ---------------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.route('**/*.mp4', (route) => route.abort())
    await page.goto(URL_, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const visible = await page.evaluate(() => {
      const img = document.querySelector('.scrub-stage-media img')
      const v = document.querySelector('.scrub-stage-media video')
      return {
        posterShown: !!img && getComputedStyle(img).opacity !== '0',
        videoHidden: !v || getComputedStyle(v).opacity === '0',
      }
    })
    console.log('клип заблокирован:')
    console.log('  постер на экране :', visible.posterShown ? 'да' : 'НЕТ')
    console.log('  видео скрыто     :', visible.videoHidden ? 'да' : 'НЕТ')
    shots.poster = (await page.screenshot({ type: 'png' })).toString('base64')
    await page.close()
  }

  // --- 2. Клип загружен: на экране первый кадр ------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(URL_, { waitUntil: 'load' })
    await page.mouse.move(700, 450)
    await page.mouse.wheel(0, 6)
    await page.waitForFunction(
      () => {
        const v = document.querySelector('.scrub-stage-media video')
        return v && v.readyState >= 2
      },
      null,
      { timeout: 20000 },
    )
    // Возвращаемся ровно в начало и даём интерполяции доехать до нуля.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(1200)
    const state = await page.evaluate(() => {
      const v = document.querySelector('.scrub-stage-media video')
      return { time: v.currentTime, opacity: getComputedStyle(v).opacity }
    })
    console.log('\nклип загружен:')
    console.log('  время на первом кадре:', state.time.toFixed(4), 'с')
    console.log('  непрозрачность видео :', state.opacity)
    shots.video = (await page.screenshot({ type: 'png' })).toString('base64')
    await page.close()
  }

  const lab = await browser.newPage()
  await lab.goto('about:blank')
  const res = await lab.evaluate(([fn, payload]) => eval(fn)(payload), [
    DIFF,
    {
      a: 'data:image/png;base64,' + shots.poster,
      b: 'data:image/png;base64,' + shots.video,
      offsets: [-2, -1, 0, 1, 2],
    },
  ])

  console.log('\nрасхождение постера и первого кадра при сдвиге по горизонтали:')
  console.log('  сдвиг   среднее   пикселей >8   пик')
  for (const r of res) {
    console.log(
      `  ${String(r.dx).padStart(4)}px  ${r.mean.toFixed(2).padStart(7)}   ` +
        `${r.over8.toFixed(2).padStart(9)}%   ${String(r.peak).padStart(3)}`,
    )
  }

  await browser.close()

  const zero = res.find((r) => r.dx === 0)
  const best = res.reduce((a, b) => (a.mean <= b.mean ? a : b))
  const problems = []
  if (best.dx !== 0) problems.push(`минимум расхождения на сдвиге ${best.dx}px — картинка едет`)
  if (zero.mean > 8) problems.push(`среднее расхождение ${zero.mean.toFixed(2)} велико для шума кодека`)

  if (problems.length) {
    console.log('\nПРОВАЛ: ' + problems.join('; '))
    process.exit(1)
  }
  console.log('\nгеометрия совпадает, подмена незаметна')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
