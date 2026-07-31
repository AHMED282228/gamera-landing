/**
 * Сколько стоит перемотка при разной плотности опорных кадров.
 *
 * Плотные опорные кадры — единственная причина, по которой клип весит столько,
 * сколько весит. Разрежаем их и смотрим, во что это обходится: замеряем время
 * от назначения currentTime до события seeked на реальном декодере Chrome.
 *
 *   node scripts/seek-latency.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync, rmSync } from 'node:fs'
import ffmpeg from 'ffmpeg-static'
import { chromium } from 'playwright'

const SRC = 'assets/OriginalKlip.mp4'
const DIR = 'public/media/_probe'
const GOPS = [4, 6, 8, 12]

mkdirSync(DIR, { recursive: true })

console.log('готовлю варианты…')
for (const g of GOPS) {
  execFileSync(
    ffmpeg,
    [
      '-y', '-i', SRC, '-vf', 'scale=1280:-2:flags=lanczos', '-an',
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-crf', '25', '-preset', 'slow',
      '-g', String(g), '-keyint_min', String(g), '-sc_threshold', '0',
      '-movflags', '+faststart', `${DIR}/g${g}.mp4`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.goto('http://localhost:4321', { waitUntil: 'load' })

console.log('\nопорный кадр   размер    медиана   худшие 10%   максимум')
console.log('-'.repeat(60))

for (const g of GOPS) {
  const stats = await page.evaluate(async (src) => {
    const v = document.createElement('video')
    v.src = src
    v.muted = true
    v.playsInline = true
    document.body.appendChild(v)
    await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }))

    const seek = (t) =>
      new Promise((resolve) => {
        const start = performance.now()
        v.addEventListener('seeked', () => resolve(performance.now() - start), { once: true })
        v.currentTime = t
      })

    // Прогреваем декодер, потом идём вразнобой — как при живом скролле.
    await seek(1)
    const times = []
    for (let i = 0; i < 60; i++) {
      const t = (Math.sin(i * 2.399) * 0.5 + 0.5) * (v.duration - 0.05)
      times.push(await seek(t))
    }
    v.remove()
    times.sort((a, b) => a - b)
    return {
      median: times[Math.floor(times.length / 2)],
      p90: times[Math.floor(times.length * 0.9)],
      max: times[times.length - 1],
    }
  }, `/media/_probe/g${g}.mp4`)

  const size = statSync(`${DIR}/g${g}.mp4`).size / 1048576
  console.log(
    `каждый ${String(g).padStart(2)}-й ${size.toFixed(2).padStart(8)} МБ ` +
      `${stats.median.toFixed(1).padStart(8)} мс ${stats.p90.toFixed(1).padStart(9)} мс ` +
      `${stats.max.toFixed(1).padStart(9)} мс`,
  )
}

await browser.close()
for (const g of GOPS) rmSync(`${DIR}/g${g}.mp4`)
rmSync(DIR, { recursive: true, force: true })
