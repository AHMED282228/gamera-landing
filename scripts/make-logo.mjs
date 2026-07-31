/**
 * Достаёт из присланного логотипа прозрачные версии под шапку, подвал и иконку.
 *
 * Исходник — квадрат 1242×1242, логотип нарисован на чёрном без альфа-канала.
 * Фон при этом не идеально чёрный: по центру он чуть подсвечен, к углам уходит
 * в ноль. Поэтому просто «вырезать чёрный» нельзя — останется грязный ореол.
 *
 * Считаем альфу как максимум из каналов, а цвет делим на неё обратно. Так
 * работает всё, что нарисовано светом на чёрном: тёмный пиксель — это не
 * тёмный цвет, а полупрозрачный светлый. Металл сохраняет свои полутона,
 * красный параллелограмм не выцветает (у него максимум по красному каналу
 * около 200 — альфа выходит почти единица), а подсветка фона отсекается
 * порогом, замеренным по углам исходника.
 *
 * Границы обрезки не задаются руками: скрипт сам считает габариты по альфе и
 * сам находит разрыв между знаком и словом, чтобы вырезать знак отдельно.
 *
 *   node scripts/make-logo.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import ffmpeg from 'ffmpeg-static'

const SRC = 'assets/logo-source.png'
const OUT = 'public/brand'

/** Фон страницы. Иконка вкладки кладётся на него, а не остаётся прозрачной. */
const BG = [0x0b, 0x07, 0x0f]

/** Ниже этого значения пиксель считается фоном и гасится полностью. */
const FLOOR = 16
/** Порог, по которому ищутся габариты: ниже — уже не рисунок, а кромка. */
const EDGE = 40

const run = (args) =>
  execFileSync(ffmpeg, args, {
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  })

// --- читаем исходник как сырые пиксели --------------------------------------

const probe = execFileSync(
  ffmpeg,
  ['-hide_banner', '-i', SRC, '-f', 'null', '-'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
)
void probe

const raw = run(['-v', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
const W = Math.round(Math.sqrt(raw.length / 3))
const H = W
if (W * H * 3 !== raw.length) {
  throw new Error(`исходник не квадратный: ${raw.length} байт`)
}

// --- альфа = максимум по каналам, цвет делится на неё обратно ----------------

const rgba = Buffer.alloc(W * H * 4)
for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
  const r = raw[i]
  const g = raw[i + 1]
  const b = raw[i + 2]
  const peak = Math.max(r, g, b)

  // Подсветка фона гасится в ноль, а всё, что выше порога, растягивается
  // обратно на полный диапазон — иначе логотип целиком стал бы полупрозрачным.
  const a = peak <= FLOOR ? 0 : Math.round(((peak - FLOOR) * 255) / (255 - FLOOR))
  if (a === 0) continue

  const k = 255 / peak
  rgba[j] = Math.min(255, Math.round(r * k))
  rgba[j + 1] = Math.min(255, Math.round(g * k))
  rgba[j + 2] = Math.min(255, Math.round(b * k))
  rgba[j + 3] = a
}

// --- габариты и разрыв между знаком и словом --------------------------------

const rowHas = new Array(H).fill(false)
const colHas = new Array(W).fill(false)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (rgba[(y * W + x) * 4 + 3] > EDGE) {
      rowHas[y] = true
      colHas[x] = true
    }
  }
}

const span = (flags) => {
  const from = flags.indexOf(true)
  const to = flags.lastIndexOf(true)
  if (from === -1) throw new Error('на картинке ничего не нашлось')
  return { from, to, size: to - from + 1 }
}

const fullY = span(rowHas)
const fullX = span(colHas)

/** Первая пустая полоса строк после начала рисунка — там кончается знак. */
let markBottom = fullY.to
for (let y = fullY.from; y <= fullY.to; y++) {
  if (!rowHas[y]) {
    markBottom = y - 1
    break
  }
}
if (markBottom === fullY.to) throw new Error('разрыв между знаком и словом не найден')

/** Габариты знака по горизонтали считаются только по его собственным строкам. */
const markCols = new Array(W).fill(false)
for (let y = fullY.from; y <= markBottom; y++) {
  for (let x = 0; x < W; x++) {
    if (rgba[(y * W + x) * 4 + 3] > EDGE) markCols[x] = true
  }
}
const markX = span(markCols)

// --- запись -----------------------------------------------------------------

mkdirSync(OUT, { recursive: true })

/** Вырезает прямоугольник из готовой RGBA-карты и отдаёт его сырыми байтами. */
const crop = (x0, y0, w, h) => {
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    rgba.copy(out, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4)
  }
  return out
}

/**
 * Кладёт RGBA поверх фона страницы и делает картинку непрозрачной.
 *
 * Нужно только иконке вкладки. Металл после обратного деления стал белым — над
 * чёрным он под своей же альфой собирается обратно в серебро, а над светлой
 * панелью браузера превратился бы в бледное пятно. Поэтому иконка носит фон
 * с собой: на вкладке это тёмный квадрат с фирменным знаком, а не призрак.
 */
const flatten = (buf) => {
  const out = Buffer.from(buf)
  for (let j = 0; j < out.length; j += 4) {
    const a = out[j + 3] / 255
    for (let c = 0; c < 3; c++) {
      out[j + c] = Math.round(out[j + c] * a + BG[c] * (1 - a))
    }
    out[j + 3] = 255
  }
  return out
}

const TMP = `${OUT}/.raw.tmp`

/** Кладёт сырые байты обратно в PNG нужного размера. */
const writePng = (buf, w, h, file, scaleTo) => {
  writeFileSync(TMP, buf)
  const filters = ['format=rgba']
  if (scaleTo) filters.push(`scale=${scaleTo}:-1:flags=lanczos`)
  const webp = file.endsWith('.webp')
  run([
    '-v', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', TMP,
    '-vf', filters.join(','),
    ...(webp
      ? ['-c:v', 'libwebp', '-lossless', '0', '-quality', '86', '-preset', 'icon']
      : ['-compression_level', '100']),
    file,
  ])
  return statSync(file).size
}

// Поле вокруг рисунка — иначе иконка упирается в собственные края.
const PAD = Math.round(markX.size * 0.06)
const mx = Math.max(0, markX.from - PAD)
const my = Math.max(0, fullY.from - PAD)
const mw = Math.min(W - mx, markX.size + PAD * 2)
const mh = Math.min(H - my, markBottom - fullY.from + 1 + PAD * 2)

// Ширины подобраны под двойную плотность от фактического размера на экране:
// знак рисуется высотой около 34px в шапке, лого целиком — около 190px в
// подвале. Больше не нужно, а вес логотипа идёт в первый экран.
// Формат — WebP, а не PNG. Логотип это плавные металлические градиенты с
// альфой, то есть худший случай для PNG: он хранит их без потерь и платит за
// это впятеро. Знак стоит в шапке и грузится вместе с первым экраном, так что
// его вес идёт прямо в скорость открытия.
const markBuf = crop(mx, my, mw, mh)
const markSize = writePng(markBuf, mw, mh, `${OUT}/logo-mark.webp`, 160)

const fullBuf = crop(fullX.from, fullY.from, fullX.size, fullY.size)
const fullSize = writePng(fullBuf, fullX.size, fullY.size, `${OUT}/logo-full.webp`, 400)

// Иконка вкладки: квадрат по знаку, чтобы буква не сплющилась.
const side = Math.max(mw, mh)
const sq = Buffer.alloc(side * side * 4)
const ox = Math.floor((side - mw) / 2)
const oy = Math.floor((side - mh) / 2)
for (let y = 0; y < mh; y++) {
  markBuf.copy(sq, ((oy + y) * side + ox) * 4, y * mw * 4, (y + 1) * mw * 4)
}
const flat = flatten(sq)
const iconSize = writePng(flat, side, side, 'app/icon.png', 96)
const appleSize = writePng(flat, side, side, 'app/apple-icon.png', 180)

rmSync(TMP, { force: true })

const kb = (n) => `${(n / 1024).toFixed(1)} КБ`
console.log(`исходник      ${W}×${H}`)
console.log(`весь логотип  x ${fullX.from}..${fullX.to}, y ${fullY.from}..${fullY.to}`)
console.log(`знак          x ${markX.from}..${markX.to}, y ${fullY.from}..${markBottom}`)
console.log(`порог фона    ${FLOOR} из 255`)
console.log('')
console.log(`logo-mark.webp ${kb(markSize)}`)
console.log(`logo-full.webp ${kb(fullSize)}`)
console.log(`app/icon.png   ${kb(iconSize)}`)
console.log(`app/apple-icon ${kb(appleSize)}`)
