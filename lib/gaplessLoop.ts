/**
 * Круг простоя без стыка.
 *
 * Обычный атрибут loop на конце файла перематывает видео в начало, и на
 * перемотке браузер держит кадр на стыке лишний раз: замер в Chrome — 67–80 мс
 * вместо 40–53 на 21 стыке из 30, то есть картинка спотыкается раз в 2,5 с.
 * Файлом это не лечится — так устроена сама перемотка.
 *
 * Здесь перемотки нет вовсе: файл скачивается один раз и через MediaSource
 * подкладывается в плеер кругами подряд — каждый следующий со сдвигом времени
 * на длину круга. Для плеера это одно непрерывное видео, поэтому стыка нет
 * (замер: задержка на стыке 1 раз из 30 — не чаще случайных посреди круга).
 * Пройденные круги удаляются из памяти, впереди всегда держится один-два.
 *
 * Файл — фрагментированный MP4 без B-кадров (scripts/encode-loop.mjs): начало
 * (описание дорожки) и тело (кадры) делятся по первому блоку moof, а без
 * B-кадров время первого кадра ровно ноль и круги ложатся встык.
 *
 * Где MediaSource нет (iPhone до iOS 17.1) или что-то пошло не так, видео
 * получает файл обычным адресом и крутится атрибутом loop, как раньше. «Что-то
 * пошло не так» включает и застревание посреди кругов: проверено только в
 * Chrome, и если другой движок перестанет отдавать кадры, через 3 с петля сама
 * перейдёт на обычный повтор, а не встанет.
 */

type MSCtor = typeof MediaSource

// Уровень 4.0: круг 21:9 шириной 1672 в 3.1 не помещается (4725 макроблоков на кадр
// при пределе 3600). Узкие круги закодированы в 3.1 — объявленный уровень выше их покрывает.
const TYPE = 'video/mp4; codecs="avc1.640028"'

/** Сколько ждать застрявшую подкладку, прежде чем перейти на обычный повтор. */
const STALL_MS = 3000

function mediaSourceCtor(): MSCtor | null {
  const w = window as unknown as { ManagedMediaSource?: MSCtor; MediaSource?: MSCtor }
  const ctor = w.ManagedMediaSource ?? w.MediaSource ?? null
  return ctor && ctor.isTypeSupported(TYPE) ? ctor : null
}

/** Делит фрагментированный MP4 на описание дорожки и кадры: по первому moof. */
function splitInit(buf: ArrayBuffer): [ArrayBuffer, ArrayBuffer] | null {
  const v = new DataView(buf)
  let at = 0
  while (at + 8 <= buf.byteLength) {
    const size = v.getUint32(at)
    const type = String.fromCharCode(v.getUint8(at + 4), v.getUint8(at + 5), v.getUint8(at + 6), v.getUint8(at + 7))
    if (type === 'moof') return [buf.slice(0, at), buf.slice(at)]
    if (size < 8) return null
    at += size
  }
  return null
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** Ждёт одно событие; слушатели снимаются в любом исходе — круги идут часами. */
function once(target: EventTarget, name: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('', 'AbortError'))
    const onAbort = () => {
      target.removeEventListener(name, onEvent)
      reject(new DOMException('', 'AbortError'))
    }
    const onEvent = () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    target.addEventListener(name, onEvent, { once: true })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Подставляет видео источник: бесшовный, если получится, иначе обычный адрес.
 * Возвращает функцию отключения (снимает слушатели, освобождает адрес).
 */
export function attachLoop(video: HTMLVideoElement, url: string): () => void {
  // Два уровня отмены: всё целиком (уход со страницы) и только подкладка
  // (переход на обычный повтор). Второй отменяется вместе с первым.
  const all = new AbortController()
  const mse = new AbortController()
  all.signal.addEventListener('abort', () => mse.abort(), { once: true })
  const { signal } = mse
  let objectUrl = ''
  let fellBack = false

  const fallback = () => {
    if (fellBack || all.signal.aborted) return
    fellBack = true
    mse.abort()
    // Пауза или игра сохраняются: петля, закрытая промоткой, стоит на паузе и
    // после смены источника не должна сама заиграть по autoplay.
    const resume = objectUrl !== '' && !video.paused
    const midway = objectUrl !== ''
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = ''
    if (midway && !resume) video.autoplay = false
    video.src = url
    video.load()
    if (resume) void video.play().catch(() => {})
  }

  const MS = mediaSourceCtor()
  if (!MS) {
    fallback()
    return () => all.abort()
  }

  const run = async () => {
    const ms = new MS()
    // ManagedMediaSource на iPhone требует или запасной адрес, или отказ от
    // AirPlay; для немого декоративного круга AirPlay не нужен.
    video.disableRemotePlayback = true
    objectUrl = URL.createObjectURL(ms)
    video.src = objectUrl
    const [data] = await Promise.all([
      fetch(url, { signal }).then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.arrayBuffer()
      }),
      once(ms, 'sourceopen', signal),
    ])
    const parts = splitInit(data)
    if (!parts) throw new Error('не фрагментированный MP4')
    const [init, body] = parts
    const sb = ms.addSourceBuffer(TYPE)
    const append = async (chunk: ArrayBuffer) => {
      sb.appendBuffer(chunk)
      await once(sb, 'updateend', signal)
    }
    await append(init)
    await append(body)
    const loopLen = sb.buffered.end(sb.buffered.length - 1)
    if (!(loopLen > 0.5)) throw new Error('пустой круг')
    let next = 1
    let busy = false

    // Держим впереди не меньше полутора кругов; позади — не больше одного.
    const pump = async () => {
      if (busy || signal.aborted || ms.readyState !== 'open') return
      busy = true
      try {
        const t = video.currentTime
        const end = sb.buffered.length ? sb.buffered.end(sb.buffered.length - 1) : 0
        if (end - t < loopLen * 1.5) {
          sb.timestampOffset = next * loopLen
          next += 1
          await append(body)
        }
        const start = sb.buffered.length ? sb.buffered.start(0) : 0
        if (t - start > loopLen * 2) {
          sb.remove(start, t - loopLen)
          await once(sb, 'updateend', signal)
        }
      } finally {
        busy = false
      }
    }
    await pump()
    // Сбой посреди кругов (нехватка памяти, ошибка разбора) — уходим на
    // обычный повтор: круг начнётся заново, но не встанет.
    const onFail = (e: unknown) => {
      if (!isAbort(e)) fallback()
    }
    for (const ev of ['timeupdate', 'waiting', 'playing']) {
      video.addEventListener(ev, () => void pump().catch(onFail), { signal })
    }
    video.addEventListener('error', fallback, { signal })

    // Сторож: петля ждёт данных дольше STALL_MS, хотя должна играть, — значит,
    // этот движок подкладку не тянет. Пауза (петлю закрыла промотка) не в счёт.
    let stall = 0
    const disarm = () => {
      window.clearTimeout(stall)
      stall = 0
    }
    const arm = () => {
      if (stall) return
      stall = window.setTimeout(() => {
        stall = 0
        if (!video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) fallback()
      }, STALL_MS)
    }
    video.addEventListener('waiting', arm, { signal })
    video.addEventListener('playing', disarm, { signal })
    video.addEventListener('pause', disarm, { signal })
    signal.addEventListener('abort', disarm, { once: true })
  }

  run().catch((e: unknown) => {
    if (!isAbort(e)) fallback()
  })

  return () => {
    all.abort()
    if (objectUrl) {
      // Снимаем и сам адрес: иначе повторный запуск (StrictMode в разработке)
      // увидел бы src и решил, что источник уже подставлен.
      URL.revokeObjectURL(objectUrl)
      if (video.src === objectUrl) {
        video.removeAttribute('src')
        video.load()
      }
    }
  }
}
