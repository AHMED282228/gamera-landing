/**
 * Пересаживает дождь из сгенерированной петли на кадр самого клипа.
 *
 * Зачем. Петля выросла из `frame-loop.jpg` — кадра, который нейросетевой
 * редактор перерисовал целиком, чтобы убрать штрихи дождя. Перерисовал он и
 * технику: сравнение нулевых кадров петли и промотки по зонам дало расхождение
 * 30 из 255 на аппарелях, где сильно разошлись 71% пикселей, 15 на платформе и
 * 12 на машине. На стыке петли с промоткой это читается не как смена дождя, а
 * как подмена самой машины — то есть ровно тот дефект, ради отсутствия которого
 * всё и делалось.
 *
 * Как чинится. В петле неподвижно всё, кроме погоды, поэтому разница между её
 * кадром и её же нулевым кадром — это и есть дождь, блики и мигание маячка,
 * без техники. Складываем эту разницу с нулевым кадром клипа:
 *
 *     выход(t) = кадр_клипа_0 + (петля(t) − петля_0)
 *
 * Получается техника из клипа с дождём из петли. Три следствия сразу:
 *
 *   - на стыке техника больше не меняется, расходится только рисунок дождя;
 *   - постер снова режется из клипа, и совпадает с петлёй пиксель в пиксель;
 *   - смыкание петли остаётся идеальным: на концах дождя нет, разница равна
 *     нулю, и выход там равен кадру клипа с обеих сторон.
 *
 * Арифметика знаковая: дождь не только светлее фона, но местами и темнее, а
 * беззнаковое вычитание такие места обрезало бы в ноль и оставляло грязь.
 *
 *   node scripts/make-loop.mjs <петля.mp4> [клип.mp4]
 */
import { spawn, execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

const LOOP_SRC = process.argv[2]
const CLIP = process.argv[3] ?? 'assets/OriginalKlip.mp4'

if (!LOOP_SRC) {
  console.error('нужен файл петли: node scripts/make-loop.mjs <петля.mp4>')
  process.exit(1)
}

const W = 1920
const H = 1080
const FRAME = W * H * 3

/** Один кадр файла в сыром виде. */
const stillOf = (file, filter = 'select=eq(n\\,0)') =>
  execFileSync(
    ffmpeg,
    [
      '-v', 'error', '-i', file,
      '-vf', `${filter},scale=${W}:${H}`,
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ],
    { maxBuffer: FRAME + 4096 },
  )

console.log('читаю опорные кадры…')
const clipBase = stillOf(CLIP)
const loopBase = stillOf(LOOP_SRC)

const OUT = 'assets/LoopKlip.mp4'

const reader = spawn(ffmpeg, [
  '-v', 'error', '-i', LOOP_SRC,
  '-vf', `scale=${W}:${H}`,
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
])

const writer = spawn(ffmpeg, [
  '-y', '-v', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', '24',
  '-i', '-',
  '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
  '-pix_fmt', 'yuv420p', '-an', OUT,
])

writer.stderr.on('data', (d) => process.stderr.write(d))

let carry = Buffer.alloc(0)
let frames = 0
let ended = false

/*
 * Буфер на каждый кадр свой, и переиспользовать один нельзя.
 *
 * Поток пишет асинхронно: write() ставит буфер в очередь и возвращается сразу.
 * Если следующий кадр пишется в тот же буфер, в очереди оказываются несколько
 * ссылок на одну память, и кодер получает последний кадр столько раз, сколько
 * их накопилось. На глаз это выглядит как подёргивание — часть кадров
 * повторяется, дождь замирает и скачет. Замер соседних кадров показывал 0,00
 * расхождения там, где должен идти дождь.
 *
 * Заодно обрабатывается противодавление: если очередь переполнена, чтение
 * приостанавливается до drain, иначе весь ролик утечёт в память разом.
 */
const pump = () => {
  while (carry.length >= FRAME) {
    const frame = carry.subarray(0, FRAME)
    carry = carry.subarray(FRAME)
    const out = Buffer.allocUnsafe(FRAME)
    for (let i = 0; i < FRAME; i++) {
      const v = clipBase[i] + (frame[i] - loopBase[i])
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v
    }
    frames++
    if (!writer.stdin.write(out)) {
      reader.stdout.pause()
      writer.stdin.once('drain', () => {
        reader.stdout.resume()
        pump()
      })
      return
    }
  }
  if (ended) writer.stdin.end()
}

reader.stdout.on('data', (chunk) => {
  carry = carry.length ? Buffer.concat([carry, chunk]) : chunk
  pump()
})

reader.stdout.on('end', () => {
  ended = true
  pump()
})

writer.on('close', () => {
  console.log(`собрано кадров: ${frames}`)
  console.log(`записано: ${OUT}`)
})
