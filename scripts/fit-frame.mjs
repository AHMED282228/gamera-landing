/**
 * Сводит правленый кадр обратно к исходнику: совмещение и тон.
 *
 * Редактор с нейросетью перерисовывает картинку целиком, поэтому вместе с
 * заказанной правкой уезжает всё остальное — общий тон, эмблема на решётке,
 * зеркала. Тон здесь считается и правится арифметикой, а не на глаз.
 *
 * Считается по областям, которых правка не касалась: небо, фон, дальняя дорога.
 * Зона машины и платформы из выборки выброшена — там картинка изменилась
 * законно, и включать её в подгонку значит подгонять под то, что мы сами и
 * просили изменить.
 *
 *   node scripts/fit-frame.mjs <правленый> <исходник> [--apply out.jpg]
 */
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
const [EDITED, SOURCE] = files
const applyIdx = args.indexOf('--apply')
const OUT = applyIdx === -1 ? null : args[applyIdx + 1]

if (!EDITED || !SOURCE) {
  console.error('нужны два файла: правленый и исходник')
  process.exit(1)
}

/** Рабочий размер для замеров. Полное разрешение тут ни к чему. */
const W = 1376
const H = 768

const load = (file) =>
  execFileSync(
    ffmpeg,
    [
      '-hide_banner', '-loglevel', 'error',
      '-i', file,
      '-vf', `crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=${W}:${H}`,
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ],
    { maxBuffer: W * H * 3 + 4096 },
  )

const a = load(EDITED)
const b = load(SOURCE)

/**
 * Прямоугольник, где стоит техника и где правка законно всё поменяла.
 * Доли кадра; всё внутри в подгонке не участвует.
 */
const SKIP = { x0: 0.08, x1: 0.72, y0: 0.28, y1: 0.82 }
const inSkip = (x, y) => {
  const u = x / W
  const v = y / H
  return u > SKIP.x0 && u < SKIP.x1 && v > SKIP.y0 && v < SKIP.y1
}

const px = (buf, x, y, c) => buf[(y * W + x) * 3 + c]

// --- совмещение ------------------------------------------------------------
// Ищем сдвиг по яркости на неизменной части кадра. Если кадрирование уехало,
// накладывать заплатки нельзя — они встанут мимо.
let best = null
for (let dy = -8; dy <= 8; dy++) {
  for (let dx = -8; dx <= 8; dx++) {
    let s = 0
    let n = 0
    for (let y = 12; y < H - 12; y += 3) {
      for (let x = 12; x < W - 12; x += 3) {
        if (inSkip(x, y)) continue
        const ya = px(a, x, y, 0) + px(a, x, y, 1) + px(a, x, y, 2)
        const yb = px(b, x + dx, y + dy, 0) + px(b, x + dx, y + dy, 1) + px(b, x + dx, y + dy, 2)
        s += Math.abs(ya - yb)
        n++
      }
    }
    const m = s / n / 3
    if (!best || m < best.m) best = { dx, dy, m }
  }
}
console.log(
  `совмещение: сдвиг dx=${best.dx} dy=${best.dy} при ${W}px ширины ` +
    `(средняя разница ${best.m.toFixed(2)})`,
)

// --- тон -------------------------------------------------------------------
// По каналу подбираем out = k*in + c методом наименьших квадратов.
/*
 * Подгонка устойчивая: считается дважды, и во второй раз худшая треть точек
 * выбрасывается.
 *
 * Без этого любая законная правка портит замер. Скажем, после переделки
 * асфальта половина нижней части кадра изменилась по существу — это не уход
 * тона, а другая картинка, и тянуть под неё поправку значит перекрасить весь
 * кадр под несуществующую ошибку. Прямоугольником такое не вырежешь: где
 * именно правили, заранее неизвестно. Отбрасывание выбросов справляется само.
 */
const CH = ['красный', 'зелёный', 'синий']
const fit = []
for (let c = 0; c < 3; c++) {
  const pairs = []
  for (let y = 12; y < H - 12; y += 2) {
    for (let x = 12; x < W - 12; x += 2) {
      if (inSkip(x, y)) continue
      pairs.push([px(a, x, y, c), px(b, x + best.dx, y + best.dy, c)])
    }
  }

  const solve = (list) => {
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    for (const [xv, yv] of list) {
      sx += xv
      sy += yv
      sxx += xv * xv
      sxy += xv * yv
    }
    const n = list.length
    const k = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    return { k, q: (sy - k * sx) / n }
  }

  let f = solve(pairs)
  const kept = pairs
    .map((p) => [p, Math.abs(f.k * p[0] + f.q - p[1])])
    .sort((u, v) => u[1] - v[1])
    .slice(0, Math.round(pairs.length * 0.67))
    .map(([p]) => p)
  f = solve(kept)

  fit.push(f)
  console.log(
    `  ${CH[c].padEnd(9)} out = ${f.k.toFixed(4)} * in ${f.q >= 0 ? '+' : '−'} ${Math.abs(f.q).toFixed(2)}` +
      `   (по ${kept.length} точкам из ${pairs.length})`,
  )
}

// Насколько это вообще нужно: средняя поправка в единицах 0..255 на среднем тоне.
const shift = fit.map((f) => Math.abs(f.k * 40 + f.q - 40))
console.log(`  поправка на тёмных тонах: ${shift.map((s) => s.toFixed(1)).join(' / ')} из 255`)

if (OUT) {
  const expr = (c) =>
    `${c}='clip(${fit['rgb'.indexOf(c)].k}*val+${fit['rgb'.indexOf(c)].q},0,255)'`
  execFileSync(
    ffmpeg,
    [
      '-hide_banner', '-loglevel', 'error',
      '-i', EDITED,
      '-vf', `lutrgb=${expr('r')}:${expr('g')}:${expr('b')}`,
      '-q:v', '2', OUT, '-y',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  console.log(`\nтон приведён к исходнику: ${OUT}`)
}
