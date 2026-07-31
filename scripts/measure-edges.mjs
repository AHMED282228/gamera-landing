/**
 * Цвет кромок кадра против фона страницы.
 *
 * На этом совпадении держится вся композиция первого экрана: кадр не обрезан
 * рамкой, а растворяется в фоне. Работает это ровно до тех пор, пока тон
 * картинки там, где градиент сходит на нет, совпадает с --bg. Разойдутся —
 * и по краю кадра пойдёт различимая полоса.
 *
 * Отсюда и способ мерить: не «средний цвет всей картинки», а тон в тех полосах,
 * где заканчиваются градиенты (--fade-l 13%, --fade-y 12%). Считается контраст
 * по WCAG между замером и --bg: 1.00 — цвета неразличимы, выше 1.15 — стык
 * начинает читаться.
 *
 * Кадры приводятся к 1920×1080 центральным кропом: исходники приходят
 * произвольных пропорций, а на сайте кадр всё равно 16:9.
 *
 *   node scripts/measure-edges.mjs assets/veo/*.png [--bg 0B070F]
 */
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

const args = process.argv.slice(2)
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const BG_HEX = flag('bg', '0B070F').replace('#', '')
const FILES = args.filter((a) => !a.startsWith('--') && !/^[0-9A-Fa-f]{6}$/.test(a))

const W = 1920
const H = 1080

const bg = [
  parseInt(BG_HEX.slice(0, 2), 16),
  parseInt(BG_HEX.slice(2, 4), 16),
  parseInt(BG_HEX.slice(4, 6), 16),
]

/** Относительная яркость по WCAG. */
const lum = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
  return (hi + 0.05) / (lo + 0.05)
}
const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Кадр в сырой RGB, приведённый к 1920×1080 центральным кропом. */
const load = (file) =>
  execFileSync(
    ffmpeg,
    [
      '-hide_banner', '-loglevel', 'error',
      '-i', file,
      '-vf', `crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=${W}:${H}`,
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ],
    { maxBuffer: W * H * 3 + 1024 },
  )

const meanOf = (buf, x0, y0, x1, y1) => {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = y0 | 0; y < y1; y++) {
    for (let x = x0 | 0; x < x1; x++) {
      const i = (y * W + x) * 3
      r += buf[i]
      g += buf[i + 1]
      b += buf[i + 2]
      n++
    }
  }
  return [r / n, g / n, b / n]
}

/*
 * Полосы. Левая — там, где сходит на нет --fade-l, верхняя и нижняя — где
 * --fade-y. Правая кромка упирается в край окна и не растворяется, поэтому
 * она здесь только для сведения.
 */
const BANDS = [
  ['левая, 10–14% ширины', (b) => meanOf(b, W * 0.1, 0, W * 0.14, H)],
  ['верхняя, 10–14% высоты', (b) => meanOf(b, 0, H * 0.1, W, H * 0.14)],
  ['нижняя, 86–90% высоты', (b) => meanOf(b, 0, H * 0.86, W, H * 0.9)],
  ['самый край, внешние 2%', (b) => meanOf(b, 0, 0, W * 0.02, H)],
]

/*
 * Порога «хорошо/плохо» в абсолютных числах здесь быть не может, и вот почему.
 *
 * Низ кадра — мокрый асфальт с оранжевыми отражениями. Он светлее фона в
 * полтора раза и будет светлее всегда, при любом клипе: затемнить его до --bg
 * значит съесть половину картинки. На сайте это работает не потому, что цвета
 * совпадают, а потому, что переход растянут на 12% высоты и не читается кромкой.
 *
 * Поэтому вопрос ставится не «тёмные ли кромки», а «такие же ли они, как у
 * того кадра, что уже стоит на сайте и всех устраивает». Эталон — нынешний
 * постер, и меряем расхождение с ним.
 */
const REF = flag('ref', 'public/media/poster-1920.jpg')

console.log(`фон страницы --bg: ${hex(bg)}`)
console.log(`эталон: ${REF}\n`)

let refBands = null
try {
  const rb = load(REF)
  refBands = BANDS.map(([, fn]) => fn(rb))
} catch {
  console.log('эталон не читается — сравниваю только с фоном\n')
}

let worst = 0
for (const file of FILES) {
  let buf
  try {
    buf = load(file)
  } catch (e) {
    console.log(`${file}\n  не читается: ${String(e.message).split('\n')[0]}\n`)
    continue
  }
  console.log(file)
  BANDS.forEach(([name, fn], i) => {
    const c = fn(buf)
    const k = ratio(c, bg)
    let tail = ''
    if (refBands) {
      // Расхождение с эталоном — по каналам, в единицах 0..255.
      const d = Math.max(...c.map((v, j) => Math.abs(v - refBands[i][j])))
      worst = Math.max(worst, d)
      tail =
        `  расхождение с эталоном ${d.toFixed(1).padStart(5)}  ` +
        (d <= 6 ? 'тот же тон' : d <= 14 ? 'чуть иначе' : 'ЗАМЕТНО СВЕТЛЕЕ/ТЕМНЕЕ')
    }
    console.log(`  ${name.padEnd(26)} ${hex(c)}  к фону ${k.toFixed(2)}${tail}`)
  })
  console.log()
}

if (refBands) {
  console.log(
    worst <= 6
      ? 'кадры тонально совпадают с нынешним постером — палитру трогать не надо'
      : worst <= 14
        ? 'небольшой уход по тону: посмотреть глазами на стык кадра с фоном'
        : 'тон ушёл — либо просить кадр в прежней гамме, либо пересчитывать --bg',
  )
}
