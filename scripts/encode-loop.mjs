/**
 * Файлы круга простоя для сайта: public/media/loop_1280.mp4 и loop_854.mp4.
 *
 * Фрагментированный MP4 без B-кадров, один опорный кадр на круг. Так lib/gaplessLoop.ts
 * может подкладывать круг в плеер раз за разом без перемотки (на перемотке атрибута
 * loop браузер держал лишний кадр — рывок раз в 2,5 с). Без B-кадров время первого
 * кадра ровно ноль, и круги ложатся встык. Тот же файл без MediaSource играет и
 * обычным адресом — запасной путь для старых iPhone.
 *
 * Профиль High. В gaplessLoop.ts объявлен уровень 4.0 (avc1.640028): круг 21:9
 * шириной 1672 в 3.1 не помещается. Остальные размеры — 3.1, объявленный уровень
 * их покрывает.
 *
 *   node scripts/encode-loop.mjs assets/bmw/klip/noch-loop-v5b-24.mkv
 *   node scripts/encode-loop.mjs КРУГ-21x9.mkv --wide   (кадр 21:9, lib/config.ts → WIDE_SHOT)
 */
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import ffmpeg from 'ffmpeg-static'

// Пометка цвета BT.601 (как у постера) — см. scripts/tag-color.mjs.
const COLOR_BSF = 'h264_metadata=video_full_range_flag=0:colour_primaries=6:transfer_characteristics=6:matrix_coefficients=6'

const SRC = process.argv[2]
if (!SRC) throw new Error('укажите исходный круг: node scripts/encode-loop.mjs КРУГ.mp4')

// Без mbtree и psy: так неподвижные места внутри круга кодируются ближе к опорному кадру, и на стыке
// (опорный кадр рисуется заново) не вспыхивает зерно. Замер на траве: 2.18 → 1.51 при обычной смене кадра 0.2.
const CALM = 'psy=0:mbtree=0'

/*
 * Круги 21:9 — сжатие бережнее (6 ноября 2026): при crf 21/23 без psy сайт терял треть
 * дождя (замер мелкого движения в небе: без потерь 0.25, было 0.16 и 0.12). Широкий
 * круг — crf 19 с psy: 0.24 при 1,29 МБ вместо 0,74. Без psy даже crf 16 давал
 * только 0.20 — psy держит мелкие капли, а не сглаживает их. Узкий — crf 19 без psy:
 * 0.16 при 0,48 МБ вместо 0,24. Прежние файлы: assets/bmw/klip/sayt-szhatie-do-6nov/.
 */
/*
 * 8 ноября 2026: широкий круг — crf 17 и preset veryslow (1,71 МБ). Его теперь получает и
 * телефон (components/sections/HeroLoop.tsx). Замер против мастера v8 (scratchpad, measure.py:
 * мелкое движение в небе / мелкая деталь кадра): crf 19 — 82% / 97%, crf 17 veryslow — 84% / 99%,
 * crf 16 veryslow — 86% / 100% (2,11 МБ), crf 14 — 91% (3,57 МБ). Скачок зерна на стыке круга
 * к обычной смене кадра: 2,8 → 2,4. Откат на crf 19: файл из ../VideoWeb/public/media/ (тот же
 * байт в байт, что даёт crf 19 preset slow).
 */
const OUT = process.argv.includes('--wide')
  ? [
      { file: 'public/media/loop21_1672.mp4', vf: 'scale=1672:720:flags=lanczos', crf: 17, preset: 'veryslow', level: '4.0', x264: 'mbtree=0' },
      { file: 'public/media/loop21_1114.mp4', vf: 'scale=1114:480:flags=lanczos', crf: 19, level: '3.1', x264: CALM },
    ]
  : [
      { file: 'public/media/loop_1280.mp4', vf: 'scale=1280:720:flags=lanczos', crf: 21, level: '3.1', x264: CALM },
      { file: 'public/media/loop_854.mp4', vf: 'scale=854:480:flags=lanczos', crf: 23, level: '3.1', x264: CALM },
    ]

for (const o of OUT) {
  execFileSync(ffmpeg, [
    '-v', 'error', '-y', '-i', SRC, '-an', '-map_metadata', '-1',
    '-vf', o.vf, '-c:v', 'libx264', '-preset', o.preset ?? 'slow', '-crf', String(o.crf),
    '-profile:v', 'high', '-level', o.level, '-bf', '0', '-g', '600', '-keyint_min', '600', '-sc_threshold', '0',
    '-x264-params', o.x264,
    '-pix_fmt', 'yuv420p', '-bsf:v', COLOR_BSF,
    '-movflags', '+frag_keyframe+empty_moov+default_base_moof+skip_trailer',
    o.file,
  ])
  console.log(`${o.file}: ${(statSync(o.file).size / 1024).toFixed(0)} КБ`)
}
