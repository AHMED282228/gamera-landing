/**
 * Свет за кадром (SceneAmbient): крошечные копии постеров, 64×36, встроенные
 * прямо в страницу — lib/ambient.ts.
 *
 * Почему не сам постер под размытием: браузер считал размытую копию, она
 * больше кадра, «главной картинкой экрана» (LCP), а рисовалась она позже
 * постера — LCP на телефоне вырос с 0,42 до 0,76 с (CPU ×4). Растянутую
 * крошку браузер в LCP не засчитывает (её собственный размер ничтожен), а
 * встроенная в HTML, она видна сразу, ещё до постера. Размытие при растяжении
 * получается само; лёгкий blur в CSS только сглаживает узор растяжения.
 *
 * Запускать после смены постеров (scripts/encode-media.mjs):
 *   node scripts/make-ambient.mjs
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import ffmpeg from 'ffmpeg-static'

// Размер крошки — пропорции постера: 16:9 → 64×36, расширенный 21:9 → 84×36.
const SRC = {
  AMBIENT: ['public/media/poster-1280.jpg', '64:36'],
  AMBIENT_WIDE: ['public/media/poster21-1672.jpg', '84:36'],
  UNLOAD_AMBIENT: ['public/media/unload-poster-1280.jpg', '64:36'],
}

const lines = [
  '// Создаётся scripts/make-ambient.mjs — руками не править.',
  '// Крошечные копии постеров для света за кадром (SceneAmbient).',
]
for (const [name, [file, size]] of Object.entries(SRC)) {
  // area — честное усреднение при уменьшении: без него крошка рябит
  // отдельными яркими точками (фонари, маячок) вместо мягкого пятна света.
  const jpg = execFileSync(ffmpeg, [
    '-v', 'error', '-i', file,
    '-vf', `scale=${size}:flags=area`, '-frames:v', '1',
    '-q:v', '3', '-f', 'image2', '-c:v', 'mjpeg', '-',
  ])
  lines.push(`export const ${name} = 'data:image/jpeg;base64,${jpg.toString('base64')}'`)
  console.log(`${name}: ${file} → ${jpg.length} байт`)
}
writeFileSync('lib/ambient.ts', lines.join('\n') + '\n')
console.log('записано lib/ambient.ts')
