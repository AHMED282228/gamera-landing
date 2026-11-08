/**
 * Пометка цвета в видео сайта: BT.601, обычный диапазон — так же, как читается постер (JPEG).
 *
 * Без пометки Chrome сам решает, как читать цвет, и красное в видео выходит оранжевее и светлее
 * постера: при смене постера на видео (и на стыке круга с промоткой) цвет «дёргается».
 * Замер в Chrome, дверь эвакуатора R,G,B: постер 92/35/34, видео без пометки 96/39/32, с пометкой 92/34/33.
 *
 * Меняется только строчка в заголовке потока (поток копируется, кадры те же). Круг — фрагментированный
 * MP4 для lib/gaplessLoop.ts, поэтому флаги контейнера у него свои, как в encode-loop.mjs.
 *
 *   node scripts/tag-color.mjs public/media/loop_1280.mp4 public/media/load_1280.mp4 ...
 */
import { execFileSync } from 'node:child_process'
import { renameSync, statSync } from 'node:fs'
import ffmpeg from 'ffmpeg-static'

export const COLOR_BSF = 'h264_metadata=video_full_range_flag=0:colour_primaries=6:transfer_characteristics=6:matrix_coefficients=6'
const FRAG = '+frag_keyframe+empty_moov+default_base_moof+skip_trailer'

const files = process.argv.slice(2)
if (!files.length) throw new Error('укажите файлы: node scripts/tag-color.mjs public/media/loop_1280.mp4 ...')
for (const f of files) {
  const tmp = f.replace(/\.mp4$/, '.tag.mp4')
  const loop = /\/loop_[^/]*\.mp4$/.test(f.replace(/\\/g, '/'))
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', f, '-map', '0:v:0', '-c', 'copy', '-bsf:v', COLOR_BSF, '-map_metadata', '-1',
    '-movflags', loop ? FRAG : '+faststart', tmp])
  renameSync(tmp, f)
  console.log(`${f}: пометка BT.601, ${(statSync(f).size / 1024).toFixed(0)} КБ${loop ? ' (фрагменты для круга)' : ''}`)
}
