/**
 * Лесенка качества: подбираем разрешение и степень сжатия по замеру, а не на глаз.
 *
 * Каждый вариант кодируется с опорным кадром каждый четвёртый (иначе промотка
 * не работает), затем разворачивается обратно в 1920 и сравнивается с исходником
 * по SSIM. Так варианты разного разрешения сравниваются честно: меряется то, что
 * в итоге увидит человек, а не размер промежуточного файла.
 *
 *   node scripts/quality-ladder.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, statSync, rmSync } from 'node:fs'
import ffmpeg from 'ffmpeg-static'

const SRC = 'assets/OriginalKlip.mp4'
const TMP =
  'C:/Temp/claude/c--Users-AHMED-Desktop-VideoWeb/0cfbab2b-cb3c-4203-bc9e-d0adeabff0e6/scratchpad/ladder'
const KEYINT = 4

const VARIANTS = [
  { width: 1920, crf: 23 },
  { width: 1920, crf: 26 },
  { width: 1920, crf: 28 },
  { width: 1600, crf: 23 },
  { width: 1600, crf: 26 },
  { width: 1280, crf: 22 },
  { width: 1280, crf: 25 },
  { width: 1280, crf: 27 },
  { width: 854, crf: 24 },
  { width: 854, crf: 27 },
]

mkdirSync(TMP, { recursive: true })

const encode = (width, crf, dest) =>
  execFileSync(
    ffmpeg,
    [
      '-y', '-i', SRC,
      '-vf', `scale=${width}:-2:flags=lanczos`,
      '-an', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-crf', String(crf), '-preset', 'medium',
      '-g', String(KEYINT), '-keyint_min', String(KEYINT), '-sc_threshold', '0',
      '-movflags', '+faststart', dest,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

const ssim = (dest) => {
  // ffmpeg печатает отчёт фильтра в stderr, поэтому читаем именно его.
  const res = spawnSync(
    ffmpeg,
    [
      '-i', dest, '-i', SRC,
      '-lavfi', '[0:v]scale=1920:1080:flags=lanczos[a];[1:v][a]ssim',
      '-f', 'null', '-',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const m = (res.stderr || '').match(/All:\s*([0-9.]+)/)
  return m ? Number(m[1]) : NaN
}

console.log('вариант          размер      SSIM к исходнику')
console.log('-'.repeat(48))
for (const v of VARIANTS) {
  const dest = `${TMP}/v${v.width}_${v.crf}.mp4`
  encode(v.width, v.crf, dest)
  const size = statSync(dest).size / 1024 / 1024
  const q = ssim(dest)
  console.log(
    `${String(v.width).padStart(4)}px crf ${String(v.crf).padStart(2)}` +
      `${size.toFixed(2).padStart(9)} МБ` +
      `${q.toFixed(4).padStart(14)}`,
  )
  rmSync(dest)
}
