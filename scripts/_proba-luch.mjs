// ПРОБА (временный файл): луч фары на первом экране. Подмешивает слои в живую страницу и снимает картинки.
// Сайт не меняет. Окон не открывает. Аргументы: папка для снимков.
import { chromium } from 'playwright'
const OUT = process.argv[2]
const ONLY = process.argv[3] // необязательно: один вариант

// Фара в кадре 21:9: 33,51% ширины, 58,69% высоты (центр яркого пятна, постер = кадр 0).
const GEO = `
.scrub-stage {
  --shot-h: calc(var(--shot-w) / (var(--shot-ar) * var(--shot-crop)));
  --lamp-x: calc(100% - var(--shot-right) - var(--shot-w) * (1 - 0.3351));
  --lamp-y: calc(var(--shot-mid) - var(--shot-h) / 2 + var(--shot-h) * 0.5869);
  --frame-x: calc(100% - var(--shot-right) - var(--shot-w));
  --warm: 255 232 204;
}
.pv { position: absolute; inset: 0; pointer-events: none; }
/* Ровный фон под текстом: темнота от левого края до носа машины (нос на 23,5% кадра) */
.pv-scrim {
  background: linear-gradient(to right,
    var(--color-bg) calc(var(--frame-x) + var(--shot-w) * 0.08),
    rgb(11 7 15 / 0.93) calc(var(--frame-x) + var(--shot-w) * 0.13),
    rgb(11 7 15 / 0.72) calc(var(--frame-x) + var(--shot-w) * 0.175),
    rgb(11 7 15 / 0.38) calc(var(--frame-x) + var(--shot-w) * 0.21),
    rgb(11 7 15 / 0.1) calc(var(--frame-x) + var(--shot-w) * 0.235),
    rgb(11 7 15 / 0) calc(var(--frame-x) + var(--shot-w) * 0.26));
}
`
// Форма луча: ось влево и чуть вниз (266°), низ мягкий и широкий, верх — резкая отсечка, как у ближнего света.
let KIND = 'low'
// Форма из съёмки (замер капель и дымки вокруг фары в петле v4): свет от 200° (вниз-влево) до 272° (чуть выше
// горизонта), выше 276° — резкая отсечка; над ней лёгкий ореол ~10%.
const SEMKA = (a) => `conic-gradient(from 195deg at var(--lamp-x) var(--lamp-y),
  rgb(0 0 0 / 0) 0deg, rgb(0 0 0 / ${0.45 * a}) 15deg, rgb(0 0 0 / ${0.8 * a}) 37deg, rgb(0 0 0 / ${a}) 73deg,
  rgb(0 0 0 / ${0.85 * a}) 77deg, rgb(0 0 0 / ${0.35 * a}) 81deg, rgb(0 0 0 / ${0.13 * a}) 87deg,
  rgb(0 0 0 / ${0.05 * a}) 105deg, rgb(0 0 0 / 0) 125deg, rgb(0 0 0 / 0) 360deg)`
// Спад дымки по замеру (от носа машины наружу); у самой фары 0 — там своя дымка в кадре, вдвойне не светим.
const fallHaze = (R) => `radial-gradient(ellipse calc(var(--shot-w) * ${R}) calc(var(--shot-w) * ${R * 0.85}) at var(--lamp-x) var(--lamp-y),
  rgb(0 0 0 / 0) 0, rgb(0 0 0 / 0.25) 10%, rgb(0 0 0 / 0.85) 20%, rgb(0 0 0 / 0.8) 28%, rgb(0 0 0 / 0.55) 38%,
  rgb(0 0 0 / 0.33) 50%, rgb(0 0 0 / 0.18) 62%, rgb(0 0 0 / 0.07) 80%, rgb(0 0 0 / 0) 100%)`
// Спад капель по замеру: у фары густо, к 0,3 ширины кадра — в 7–10 раз слабее.
const fallRain = (R, at) => `radial-gradient(ellipse calc(var(--shot-w) * ${R}) calc(var(--shot-w) * ${R * 0.85}) at ${at},
  rgb(0 0 0 / 0) 0, rgb(0 0 0 / 0.3) 10%, rgb(0 0 0 / 0.75) 20%, rgb(0 0 0 / 0.5) 30%, rgb(0 0 0 / 0.3) 45%,
  rgb(0 0 0 / 0.14) 65%, rgb(0 0 0 / 0) 100%)`
const cone = (a) => KIND === 'semka' ? SEMKA(a) : KIND === 'low'
  ? `conic-gradient(from 222deg at var(--lamp-x) var(--lamp-y),
  rgb(0 0 0 / 0) 0deg, rgb(0 0 0 / ${0.12 * a}) 10deg, rgb(0 0 0 / ${0.45 * a}) 22deg, rgb(0 0 0 / ${0.85 * a}) 34deg,
  rgb(0 0 0 / ${a}) 44deg, rgb(0 0 0 / ${a}) 54deg, rgb(0 0 0 / ${0.55 * a}) 57deg, rgb(0 0 0 / 0) 61deg, rgb(0 0 0 / 0) 360deg)`
  : `conic-gradient(from 244deg at var(--lamp-x) var(--lamp-y),
  rgb(0 0 0 / 0) 0deg, rgb(0 0 0 / ${0.15 * a}) 8deg, rgb(0 0 0 / ${0.5 * a}) 16deg, rgb(0 0 0 / ${0.88 * a}) 26deg,
  rgb(0 0 0 / ${a}) 34deg, rgb(0 0 0 / ${0.88 * a}) 42deg, rgb(0 0 0 / ${0.5 * a}) 52deg, rgb(0 0 0 / ${0.15 * a}) 60deg,
  rgb(0 0 0 / 0) 68deg, rgb(0 0 0 / 0) 360deg)`
const fall = (r) => `radial-gradient(ellipse calc(var(--shot-w) * ${r}) calc(var(--shot-w) * ${r * 0.8}) at var(--lamp-x) var(--lamp-y),
  #000 0, rgb(0 0 0 / 0.78) 7%, rgb(0 0 0 / 0.5) 20%, rgb(0 0 0 / 0.27) 42%, rgb(0 0 0 / 0.1) 70%, rgb(0 0 0 / 0) 100%)`
const beamMask = (a, r) => `-webkit-mask-image: ${cone(a)}, ${fall(r)}; -webkit-mask-composite: source-in; mask-image: ${cone(a)}, ${fall(r)}; mask-composite: intersect;`

const HAZE = (op, r) => `
.pv-haze { background: rgb(var(--warm)); mix-blend-mode: screen; opacity: ${op}; filter: blur(6px); ${beamMask(1, r)} }
`
// Подсветка сцены: в луче затемнение слабее — видна настоящая трава и мокрый асфальт у машины
const RELIGHT = (r) => `
.pv-scrim { -webkit-mask-image: linear-gradient(#000, #000), ${cone(0.8)}, ${fall(r)};
  -webkit-mask-composite: source-out, source-in; mask-image: linear-gradient(#000, #000), ${cone(0.8)}, ${fall(r)}; mask-composite: subtract, intersect; }
`
const RAIN = (op, r) => `
.pv-rain { position: absolute; pointer-events: none; mix-blend-mode: screen; opacity: ${op};
  left: calc(var(--lamp-x) - var(--shot-w) * 0.62); top: calc(var(--lamp-y) - var(--shot-w) * 0.3);
  width: calc(var(--shot-w) * 0.62); height: calc(var(--shot-w) * 0.6); object-fit: cover;
  filter: sepia(0.45) saturate(1.3) brightness(1.15);
  -webkit-mask-image: ${cone(1).replace('at var(--lamp-x) var(--lamp-y)', 'at 100% 50%')}, ${fall(r).replace('at var(--lamp-x) var(--lamp-y)', 'at 100% 50%')};
  -webkit-mask-composite: source-in;
  mask-image: ${cone(1).replace('at var(--lamp-x) var(--lamp-y)', 'at 100% 50%')}, ${fall(r).replace('at var(--lamp-x) var(--lamp-y)', 'at 100% 50%')};
  mask-composite: intersect; }
`
const BLOOM = `
.pv-bloom { background: radial-gradient(ellipse calc(var(--shot-w) * 0.07) calc(var(--shot-w) * 0.05) at var(--lamp-x) var(--lamp-y),
  rgb(var(--warm) / 0.55) 0, rgb(var(--warm) / 0.22) 45%, rgb(var(--warm) / 0) 100%); mix-blend-mode: screen; }
`
const RAIN2 = (op, r, br) => RAIN(op, r).replace('filter: sepia(0.45) saturate(1.3) brightness(1.15);', `filter: sepia(0.5) saturate(1.4) brightness(${br});`)
// Вариант по замеру: дымка и капли со спадом, как в съёмке; под абзацем тёмная кайма у букв, чтобы капли не цепляли текст.
// Земля: ниже ~0,1 ширины кадра под фарой свет упирается в дорогу — дальше вниз дымки нет.
const ground = (y) => `linear-gradient(to bottom, #000 calc(${y} + var(--shot-w) * 0.05), rgb(0 0 0 / 0) calc(${y} + var(--shot-w) * 0.15))`
const HAZE7 = (op, R) => {
  const m = `${cone(1)}, ${fallHaze(R)}, ${ground('var(--lamp-y)')}`
  return `
.pv-haze { background: rgb(var(--warm)); mix-blend-mode: screen; opacity: ${op}; filter: blur(5px);
  -webkit-mask-image: ${m}; -webkit-mask-composite: source-in, source-in; mask-image: ${m}; mask-composite: intersect, intersect; }
`
}
const RAIN7 = (br, R) => {
  const m = `${cone(1).replace('at var(--lamp-x) var(--lamp-y)', 'at 100% 50%')}, ${fallRain(R, '100% 50%')}, ${ground('50%')}`
  return `
.pv-rain { position: absolute; pointer-events: none; mix-blend-mode: screen;
  left: calc(var(--lamp-x) - var(--shot-w) * 0.62); top: calc(var(--lamp-y) - var(--shot-w) * 0.3);
  width: calc(var(--shot-w) * 0.62); height: calc(var(--shot-w) * 0.6); object-fit: cover;
  filter: sepia(0.5) saturate(1.4) brightness(${br});
  -webkit-mask-image: ${m}; -webkit-mask-composite: source-in, source-in;
  mask-image: ${m}; mask-composite: intersect, intersect; }
`
}
// Абзац стоит в луче: буквы светлее и теплее (серый #a5a5a5 на дымке давал контраст 2,4 при норме 4,5).
const KAJMA = `.hero-copy p { text-shadow: 0 0 10px rgb(11 7 15 / 0.85), 0 0 3px rgb(11 7 15 / 0.7); }
.hero-copy .prose-measure { color: #e6dfd5; }`
const VARIANTS = {
  '0-sejchas': null,
  '1-rovnyj-fon': { css: GEO, layers: ['scrim'] },
  '5-blizhnij': { kind: 'low', css: () => GEO + HAZE(0.42, 0.66) + RELIGHT(0.26) + RAIN2(1, 0.8, 2.2) + BLOOM, layers: ['scrim', 'haze', 'rain', 'bloom'] },
  '6-dalnij': { kind: 'high', css: () => GEO + HAZE(0.36, 0.7) + RELIGHT(0.26) + RAIN2(1, 0.85, 2.2) + BLOOM, layers: ['scrim', 'haze', 'rain', 'bloom'] },
  '7-iz-semki': { kind: 'semka', css: () => GEO + HAZE7(0.42, 0.6) + RELIGHT(0.26) + RAIN7(1.9, 0.45) + BLOOM + KAJMA, layers: ['scrim', 'haze', 'rain', 'bloom'] },
}

// Режим «--css <файл>»: выгрузить стили вариантов для живой страницы-примерки.
if (OUT === '--css') {
  const { writeFileSync } = await import('node:fs')
  const outCss = {}
  for (const [name, v] of Object.entries(VARIANTS)) {
    if (!v) { outCss[name] = null; continue }
    KIND = v.kind || 'low'
    outCss[name] = { css: typeof v.css === 'function' ? v.css() : v.css, layers: v.layers }
  }
  writeFileSync(process.argv[3], JSON.stringify(outCss))
  console.log('стили записаны:', Object.keys(outCss).join(', '))
  process.exit(0)
}

const browser = await chromium.launch({ channel: 'chrome' })
const report = []
for (const [w, h] of [[1440, 900], [1280, 720], [1920, 1080]]) {
  for (const [name, v] of Object.entries(VARIANTS)) {
    if (ONLY && name !== ONLY) continue
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.goto('http://localhost:4321', { waitUntil: 'load' })
    await page.waitForTimeout(2200)
    if (v) {
      KIND = v.kind || 'low'
      await page.addStyleTag({ content: typeof v.css === 'function' ? v.css() : v.css })
      await page.evaluate((layers) => {
        const media = document.querySelector('.scrub-stage-media')
        const frame = media.querySelector('.scrub-frame')
        let after = frame
        for (const l of layers) {
          let el
          if (l === 'rain') {
            el = document.createElement('video')
            Object.assign(el, { src: '/_proba/rain-dense.mp4', muted: true, loop: true, autoplay: true, playsInline: true })
            el.className = 'pv-rain'
          } else {
            el = document.createElement('div')
            el.className = `pv pv-${l}`
          }
          after.after(el)
          after = el
        }
      }, v.layers)
      if (v.layers.includes('rain')) await page.waitForFunction(() => document.querySelector('.pv-rain')?.readyState >= 3, null, { timeout: 15000 })
      await page.waitForTimeout(700)
    }
    await page.screenshot({ path: `${OUT}/${name}-${w}.png` })
    const boxes = await page.evaluate(() => {
      const pick = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round) }
      const h1 = document.querySelector('.scrub-copy h1'); const p = h1?.parentElement?.querySelector('p')
      return { h1: h1 && pick(h1), p: p && pick(p), pColor: p && getComputedStyle(p).color }
    })
    await page.addStyleTag({ content: '.scrub-copy, header { visibility: hidden !important; }' })
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${OUT}/${name}-${w}-fon.png` })
    report.push(`${w}x${h} ${name}: ${JSON.stringify(boxes)}`)
    // контраст: фон под абзацем без текста — самая светлая точка в рамке абзаца
    await page.close()
  }
}
await browser.close()
console.log(report.join('\n'))
