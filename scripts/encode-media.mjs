/**
 * Готовит клипы под промотку из исходника public/media/OriginalKlip.mp4.
 *
 * Исходник как есть для промотки непригоден: в нём один опорный кадр на всё
 * видео, поэтому перемотка в произвольную точку заставляет декодер каждый раз
 * идти от начала. Здесь опорный кадр ставится каждый четвёртый — перемотка
 * становится дешёвой, ценой примерно полутора-двух крат размера файла.
 *
 * Звук выбрасывается: он не нужен и мешает разблокировке автозапуска на iOS.
 * moov уезжает в начало файла (+faststart), иначе браузер не может начать
 * перемотку, не скачав файл целиком.
 *
 * Постер режется из первого кадра этого же исходника — только так он совпадает
 * с первым кадром клипа пиксельно, а подмена остаётся незаметной.
 *
 *   node scripts/encode-media.mjs [--src файл] [--keyint 16] [--crf-1280 25] [--dry]
 *
 * Ночная основа BMW (24 к/с): --src assets/bmw/klip/itog-noch-10s.mp4 --keyint 8
 *
 * Кадр 21:9 (lib/config.ts → WIDE_SHOT): node scripts/encode-media.mjs --wide
 * Берёт assets/bmw/klip/noch-scrub21-v9g.mp4, пишет load21_1672 и load21_1114.
 * Постеры 21:9 в этом режиме не трогаются: они уже вырезаны из первого кадра
 * того же исходника и от сжатия клипа не зависят.
 */
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import ffmpeg from 'ffmpeg-static'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const DRY = args.includes('--dry')
const WIDE = args.includes('--wide')

const SRC = arg('src', WIDE ? 'assets/bmw/klip/noch-scrub21-v9g.mp4' : 'assets/OriginalKlip.mp4')
const OUT = 'public/media'

/**
 * Опорный кадр каждый N-й.
 *
 * Значение выбрано замером, а не на глаз: scripts/seek-latency.mjs гоняет по 60
 * перемоток вразнобой на реальном декодере. Разница между «каждым четвёртым» и
 * «каждым восьмым» по времени перемотки в пределах погрешности (медиана 7.8 и
 * 7.9 мс), а по весу — полтора раза. Дальше разрежать смысла мало: на двенадцати
 * медиана уже ползёт вверх, и запас для слабых мобильных декодеров съедается.
 *
 * Считать надо во времени, а не в кадрах: тот замер делался на клипе 24 к/с,
 * где каждый восьмой кадр — это опорный раз в треть секунды. Клип теперь 48 к/с,
 * поэтому то же расстояние по времени даёт каждый шестнадцатый.
 *
 * Разница по весу при этом громадная: при 48 к/с и опорном каждом восьмом файл
 * весит 4,29 МБ, а при каждом шестнадцатом — 2,91 МБ. Второе даже легче, чем
 * прежний клип 24 к/с (2,99 МБ), хотя кадров вдвое больше: лишние кадры
 * оказываются дешёвыми, а экономия на опорных их перекрывает.
 */
const KEYINT = Number(arg('keyint', WIDE ? 8 : 16))

/**
 * Тира два, как и просит бриф. Тир 1920 не заводим намеренно: кадр на странице
 * рисуется шириной не больше 1280 CSS-пикселей, то есть версия 1280 идёт на
 * обычном мониторе один в один, а лишние мегабайты работают против скорости.
 */
/*
 * 21:9 — сжатие бережнее (6 ноября 2026). При crf 25 сайт терял половину дождя:
 * мелкое движение в небе у фонаря 0.34 до сжатия → 0.17 (у клипа Wan — 0.28).
 * crf 23 с -tune grain (x264 держит зерно и мелкие капли, а не сглаживает их) —
 * 0.24 при 4,5 МБ вместо 3,3 (узкий — 2,4 вместо 1,8). Первый экран от этого не
 * медленнее: видео качается после загрузки страницы (замер на копии сайта с
 * имитацией сети: 0,9 с на 4G, 1,9 с на слабом 4G — одинаково). Дольше только
 * докачка: на 4G 4,5 с вместо 3,7, на слабом 4G 21 с вместо 16.
 * Прежние файлы для отката: assets/bmw/klip/sayt-szhatie-do-6nov/.
 */
const TARGETS = WIDE
  ? [
      { name: 'load21_1672.mp4', width: 1672, crf: Number(arg('crf-1672', 23)), tune: 'grain' },
      { name: 'load21_1114.mp4', width: 1114, crf: Number(arg('crf-1114', 23)), tune: 'grain' },
    ]
  : [
      { name: 'load_1280.mp4', width: 1280, crf: Number(arg('crf-1280', 25)) },
      { name: 'load_854.mp4', width: 854, crf: Number(arg('crf-854', 25)) },
    ]

const run = (params) => {
  if (DRY) {
    console.log('  ffmpeg', params.join(' '))
    return
  }
  execFileSync(ffmpeg, params, { stdio: ['ignore', 'ignore', 'pipe'] })
}

const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(2) + ' МБ'

console.log('исходник:', SRC, mb(SRC), '\n')

for (const t of TARGETS) {
  const dest = `${OUT}/${t.name}`
  process.stdout.write(`${t.name.padEnd(16)} ${String(t.width).padStart(4)}px crf ${t.crf} … `)
  run([
    '-y',
    '-i', SRC,
    // Метаданные исходника (в съёмке бывают координаты) в файл сайта не переносим.
    '-map_metadata', '-1',
    // Чётная высота обязательна для yuv420p, отсюда -2 вместо точного числа.
    '-vf', `scale=${t.width}:-2:flags=lanczos`,
    '-an',
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-crf', String(t.crf),
    '-preset', 'slow',
    ...(t.tune ? ['-tune', t.tune] : []),
    // Опорный кадр строго каждый KEYINT: без отключения детектора смены сцены
    // ffmpeg расставил бы их по своему усмотрению и промотка местами провалилась бы.
    '-g', String(KEYINT),
    '-keyint_min', String(KEYINT),
    '-sc_threshold', '0',
    // Пометка цвета BT.601, как у постера: без неё Chrome красит видео иначе (scripts/tag-color.mjs).
    '-bsf:v', 'h264_metadata=video_full_range_flag=0:colour_primaries=6:transfer_characteristics=6:matrix_coefficients=6',
    '-movflags', '+faststart',
    dest,
  ])
  console.log(DRY ? '' : mb(dest))
}

/**
 * Постер — первый кадр этого же исходника, поэтому он совпадает с первым кадром
 * клипа пиксельно и подмена остаётся незаметной.
 *
 * Размеров два, как в srcSet (lib/config.ts): постер показывается раньше всего
 * остального и считается за LCP, поэтому телефон не должен тянуть картинку под
 * широкий монитор. 1920 убран: кадр рисуется не шире 1280 CSS-пикселей, и
 * страница его больше не запрашивает. Разрешение на совпадение не влияет — оба
 * слоя всё равно масштабируются в один и тот же бокс.
 */
const POSTERS = [
  { name: 'poster-1280.jpg', width: 1280, q: 4 },
  { name: 'poster-854.jpg', width: 854, q: 4 },
]

/**
 * Постер шире исходника не режем: растянутый кадр ничего не добавляет к
 * резкости, только вес. Ширину исходника берём из заголовка ffmpeg.
 */
const probe = (() => {
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', SRC], { stdio: 'pipe' })
  } catch (e) {
    return String(e.stderr)
  }
  return ''
})()
const srcWidth = Number((probe.match(/Video:.*?(\d{3,5})x\d{3,5}/) || [])[1] || 99999)

for (const p of WIDE ? [] : POSTERS.filter((p) => p.width <= srcWidth)) {
  process.stdout.write(`${p.name.padEnd(16)} ${String(p.width).padStart(4)}px         … `)
  run([
    '-y',
    '-i', SRC,
    '-vf', `select=eq(n\\,0),scale=${p.width}:-2:flags=lanczos`,
    '-frames:v', '1',
    '-q:v', String(p.q),
    `${OUT}/${p.name}`,
  ])
  console.log(DRY ? '' : mb(`${OUT}/${p.name}`))
}
