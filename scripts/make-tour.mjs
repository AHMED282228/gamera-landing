// Файлы для обзора эвакуатора (components/sections/Truck.tsx).
//   node scripts/make-tour.mjs
//
// Кадры сцены — настоящая съёмка владельца 4K (ночные версии из Gemini владельцу
// не понравились, 15 ноября 2026):
//   a — gemini/1-sboku-apparely.jpg: сбоку, аппарели опущены (номеров не видно);
//   b — IMG_2167, 0,5 с: сзади, платформа пустая — лебёдка, излом, аппарели;
//   c — gemini/2-szadi-apparely.jpg: сзади, BMW на платформе.
// Номера (BMW и эвакуатора) размыты строго по контуру таблички.
// Свет чуть притушен и охлаждён под тёмную страницу, края затемнены: это всё
// та же съёмка в сумерках, а не подделка ночи.
// Если владелец пришлёт кадры из Gemini по gemini/OBZOR-ZAPROSY.md с тем же
// кадрированием — положить их вместо исходников (SRC_A/B/C) и пересобрать:
// координаты деталей в Truck.tsx останутся верными.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { statSync } from 'node:fs'

const require = createRequire(import.meta.url)
const FF = require('ffmpeg-static')
const OUT = 'public/photos'
const SRC = '../VideoWeb/assets/bmw/IMG_2167.MP4'

const run = (args) => execFileSync(FF, ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
const kb = (f) => `${Math.round(statSync(f).size / 1024)} КБ`

const SRC_A = 'gemini/1-sboku-apparely.jpg'
const SRC_B = 'gemini/obzor/b-szadi-pustoj.jpg'
const SRC_C = 'gemini/2-szadi-apparely.jpg'

// Кадр b — из ролика (метаданные с координатами не переносятся: -map_metadata -1).
run(['-ss', '0.5', '-i', SRC, '-map_metadata', '-1', '-frames:v', '1', '-q:v', '1', SRC_B])

// Номера размываются строго по контуру таблички (scripts/blur-plates.py), вокруг
// ничего не трогается — замечание владельца 15 ноября 2026.
execFileSync('python', ['-I', 'scripts/blur-plates.py'], { stdio: 'inherit' })

const GRADE = 'eq=brightness=-0.055:contrast=1.06:saturation=0.86,colorbalance=bs=0.035:bm=0.015,vignette=PI/4.6'

for (const [src, name] of [
  [SRC_A, 'tour-a'],
  ['gemini/obzor/b-bez-nomera.png', 'tour-b'],
  ['gemini/obzor/c-bez-nomera.png', 'tour-c'],
]) {
  for (const w of [2752, 1600]) {
    const f = `${OUT}/${name}-${w}.webp`
    run(['-i', src, '-map_metadata', '-1', '-vf', `${GRADE},scale=${w}:-2:flags=lanczos`,
      '-c:v', 'libwebp', '-quality', w > 2000 ? '76' : '78', '-compression_level', '6', f])
    console.log(f, kb(f))
  }
}

{
  const f = `${OUT}/tour-remen.webp`
  run(['-i', 'gemini/4-remen-na-zemle.jpg', '-map_metadata', '-1', '-vf', 'crop=600:470:0:330', '-c:v', 'libwebp', '-quality', '80', f])
  console.log(f, kb(f))
}

{
  const grade = 'eq=brightness=-0.045:contrast=1.06:saturation=0.86,vignette=PI/5'
  const vf = `crop=1600:900:1650:1260,setpts=PTS/0.75,fps=30,scale=800:450:flags=lanczos,${grade},fade=t=in:st=0:d=0.3,fade=t=out:st=3.95:d=0.3,format=yuv420p`
  const f = `${OUT}/tour-apparely.mp4`
  run(['-ss', '5.4', '-t', '3.2', '-i', SRC, '-map_metadata', '-1', '-an', '-vf', vf,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryslow', '-crf', '25', '-movflags', '+faststart', f])
  console.log(f, kb(f))
  const p = `${OUT}/tour-apparely.webp`
  run(['-ss', '1.6', '-i', f, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '72', p])
  console.log(p, kb(p))
}
