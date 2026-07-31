/**
 * Переносит прямоугольную область из одного кадра в другой с мягкими краями.
 *
 * Нужно потому, что редактор с нейросетью перерисовывает картинку целиком:
 * вместе с заказанной правкой платформы он сглаживает решётку, теряет капли
 * на кузове, кривит эмблему и подменяет зеркала. Просить у него аккуратности
 * бесполезно — проще вернуть нетронутую область из исходника.
 *
 * Работает это только потому, что кадрирование совпадает пиксель в пиксель:
 * проверяется scripts/fit-frame.mjs, и если он покажет сдвиг — заплатка встанет
 * мимо, и накладывать её нельзя.
 *
 * Тон источника при этом уже должен быть сведён (тем же fit-frame), иначе на
 * границе заплатки проступит ступенька по цвету.
 *
 *   node scripts/patch-frame.mjs <куда> <откуда> <выход> --box x,y,w,h [--feather 60]
 */
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--') && !a.includes(','))
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}

const [BASE, FROM, OUT] = files
const BOX = (flag('box', '') || '').split(',').map(Number)
const FEATHER = Number(flag('feather', 60))

if (!BASE || !FROM || !OUT || BOX.length !== 4) {
  console.error('нужно: <куда> <откуда> <выход> --box x,y,w,h')
  process.exit(1)
}

/*
 * Размеры берутся из отчёта ffmpeg о входном файле. Без выходного файла он
 * всегда завершается с ошибкой — это нормально, нужный текст к этому моменту
 * уже написан в stderr, поэтому исключение здесь ловится и разбирается.
 */
const probeText = (() => {
  try {
    return execFileSync(ffmpeg, ['-hide_banner', '-i', BASE], {
      stdio: ['ignore', 'ignore', 'pipe'],
    }).toString()
  } catch (e) {
    return String(e.stderr ?? '')
  }
})()
const probe = probeText.match(/, (\d+)x(\d+)/)
if (!probe) {
  console.error('не удалось прочитать размеры кадра')
  process.exit(1)
}
const W = Number(probe[1])
const H = Number(probe[2])

const raw = (file) =>
  execFileSync(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1',
     '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: W * H * 3 + 4096 },
  )

const base = raw(BASE)
const from = raw(FROM)
if (base.length !== from.length) {
  console.error(`размеры не совпадают: ${base.length} и ${from.length}`)
  process.exit(1)
}

const [bx, by, bw, bh] = BOX
let blended = 0

for (let y = by; y < by + bh; y++) {
  if (y < 0 || y >= H) continue
  // Расстояние до ближайшего края по вертикали.
  const dy = Math.min(y - by, by + bh - 1 - y)
  for (let x = bx; x < bx + bw; x++) {
    if (x < 0 || x >= W) continue
    const dx = Math.min(x - bx, bx + bw - 1 - x)
    // Мягкий край: доля берётся по ближайшей границе прямоугольника.
    const a = Math.min(1, Math.min(dx, dy) / FEATHER)
    if (a <= 0) continue
    const i = (y * W + x) * 3
    base[i] = base[i] + (from[i] - base[i]) * a
    base[i + 1] = base[i + 1] + (from[i + 1] - base[i + 1]) * a
    base[i + 2] = base[i + 2] + (from[i + 2] - base[i + 2]) * a
    blended++
  }
}

execFileSync(
  ffmpeg,
  ['-hide_banner', '-loglevel', 'error',
   '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-',
   '-frames:v', '1', '-q:v', '2', OUT, '-y'],
  { input: base, maxBuffer: W * H * 3 + 4096 },
)

console.log(
  `перенесено ${(blended / 1e6).toFixed(1)} млн пикселей, ` +
    `растушёвка ${FEATHER}px → ${OUT}`,
)
