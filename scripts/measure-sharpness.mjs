/**
 * Сколько настоящей детализации в исходниках и во что она превращается на экране.
 *
 * Считаем энергию высоких частот (дисперсию лапласиана). Если картинку ужать до
 * меньшего размера и растянуть обратно, у настоящего детального исходника
 * энергия заметно упадёт, а у растянутого из мелкого — почти нет: терять нечего.
 * Так и проверяем, есть ли в постере 1920 хоть что-то сверх 1280.
 *
 *   node scripts/measure-sharpness.mjs
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')

const PROBE = `
(async ({ src, steps }) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  await img.decode()

  const draw = (w, h, from) => {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const x = c.getContext('2d', { willReadFrequently: true })
    x.imageSmoothingQuality = 'high'
    x.drawImage(from, 0, 0, w, h)
    return c
  }

  // Дисперсия лапласиана по яркости — чем выше, тем больше мелких деталей.
  const energy = (canvas) => {
    const w = canvas.width, h = canvas.height
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
    const lum = new Float64Array(w * h)
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    }
    let sum = 0, sum2 = 0, n = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x
        const v = 4 * lum[p] - lum[p - 1] - lum[p + 1] - lum[p - w] - lum[p + w]
        sum += v; sum2 += v * v; n++
      }
    }
    const mean = sum / n
    return sum2 / n - mean * mean
  }

  const native = draw(img.width, img.height, img)
  const out = { width: img.width, height: img.height, native: energy(native) }
  out.rounds = steps.map((s) => {
    const small = draw(Math.round(img.width * s), Math.round(img.height * s), img)
    const back = draw(img.width, img.height, small)
    return { scale: s, energy: energy(back) }
  })
  return out
})
`

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  await page.goto(URL_, { waitUntil: 'load' })

  console.log('=== постер: есть ли детализация сверх 1280 ===')
  const poster = await page.evaluate(([fn, payload]) => eval(fn)(payload), [
    PROBE,
    { src: '/media/poster.jpg', steps: [1280 / 1920, 854 / 1920, 640 / 1920] },
  ])
  console.log(`  размер ${poster.width}x${poster.height}`)
  console.log(`  энергия деталей в оригинале: ${poster.native.toFixed(1)}`)
  for (const r of poster.rounds) {
    const w = Math.round(poster.width * r.scale)
    const keep = (100 * r.energy) / poster.native
    console.log(
      `  через ${String(w).padStart(4)}px и обратно: ${r.energy.toFixed(1).padStart(7)}` +
        `  (${keep.toFixed(0)}% исходной)`,
    )
  }

  console.log('\n=== во что это превращается на экране ===')
  for (const w of [1280, 1440, 1920, 2560]) {
    // cover по высоте: кадр 16:9 в окне 16:10 растягивается по высоте
    const h = Math.round(w / 1.6)
    const drawnWidth = h * (16 / 9)
    const srcWidth = w <= 899 ? 854 : 1280
    const factor = drawnWidth / srcWidth
    console.log(
      `  окно ${String(w).padStart(4)}x${String(h).padStart(4)}: клип ${srcWidth}px рисуется в ${Math.round(drawnWidth)}px ` +
        `— ${factor >= 1 ? 'растяжение' : 'сжатие'} ${factor.toFixed(2)}x`,
    )
  }

  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
