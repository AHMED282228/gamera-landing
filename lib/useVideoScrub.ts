'use client'

import { useEffect, useRef, type RefObject } from 'react'
import type { MotionValue } from 'motion/react'

/*
 * Своего сглаживания здесь нет: прогресс приходит уже плавным из
 * useSmoothProgress, и от того же значения живут текст и шкала. Раньше клип
 * сглаживал сам (0.12 за кадр плюс торможение по корню), а текст шёл за
 * колесом мгновенно — щелчок колеса рвал их в разные стороны. Второе
 * сглаживание поверх первого ещё и отставало бы от текста на треть секунды.
 *
 * Растворение соседних кадров. Клип снят в 24 к/с, щелчок колеса проходит
 * около восьми кадров, и на торможении каждый кадр стоял на экране по
 * 80–107 мс (замер rVFC) — глаз видел это как ступеньки: «тормозит с
 * рывками». Показать кадр, которого в файле нет, промотка не может, поэтому
 * между кадрами n и n+1 она их растворяет: два слоя одного клипа, нижний
 * держит чётные кадры, верхний нечётные, прозрачность верхнего — дробная
 * часть позиции. Изображение меняется на каждом кадре экрана, а не раз в
 * 0,1 с. Остановка всегда приходится на целый кадр (useSmoothProgress
 * округляет цель), так что в покое двоения нет.
 *
 * Перематывается слой только тогда, когда сменился его кадр, — на медленном
 * ходу запросов меньше, чем было с одним слоем (тот перематывался на каждом
 * кадре экрана). На быстром ходу (больше кадра клипа за кадр экрана)
 * растворение незаметно, и второй слой не дёргается вовсе — работает тот, чей
 * кадр ближе.
 */

/**
 * Не доводим до самого конца дорожки: перемотка ровно в duration в части
 * браузеров роняет картинку в пустой кадр. Кадры запрашиваются серединой
 * (m + 0,5) / fps, последний — за полкадра до конца, то есть раньше этой
 * границы; она остаётся страховкой на случай округлённой длительности.
 */
const END_EPSILON = 0.02

/*
 * Растворение — на весь промежуток между кадрами, прямо по дробной позиции.
 * Пробовали растворять только в средней половине (края — чистый кадр), чтобы
 * меньше двоения на торможении: на глаз владельца — «резко, с рывком», кадр
 * стоит, потом быстро сменяется. Двоение лечится коротким концом торможения
 * (useSmoothProgress), а не формой растворения.
 */

/** Частота отчётов для HUD — не чаще 10 раз в секунду. */
const SAMPLE_INTERVAL_MS = 100

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Клип скачан целиком — второй слой возьмёт его из кэша, без второй загрузки. */
const fullyBuffered = (v: HTMLVideoElement) => {
  const b = v.buffered
  return (
    Number.isFinite(v.duration) &&
    b.length > 0 &&
    b.start(0) <= 0.05 &&
    b.end(b.length - 1) >= v.duration - 0.1
  )
}

type Params = {
  /** Прогресс секции 0..1 — уже сглаженный (useSmoothProgress). */
  progress: MotionValue<number>
  sectionRef: RefObject<HTMLElement | null>
  /** Нижний слой: чётные кадры. Он же единственный, пока второй не готов. */
  videoRef: RefObject<HTMLVideoElement | null>
  /** Верхний слой: нечётные кадры, прозрачность ставит хук. */
  blendRef?: RefObject<HTMLVideoElement | null>
  sources: { wide: string; narrow: string; narrowMaxWidth: number; fps: number }
  /** false при prefers-reduced-motion — тогда видео не грузится вовсе. */
  enabled: boolean
  /** Вызывается не чаще 10 Гц с текущим прогрессом. */
  onSample?: (progress: number) => void
  /** Первый декодированный кадр на экране — можно показывать видео. */
  onReady?: () => void
  /** Число кадров клипа — как только известна длительность. */
  onFrameCount?: (frames: number) => void
  /**
   * Цеплять источник не по загрузке страницы, а когда секция подошла к окну
   * ближе чем на полтора экрана. Для сцен ниже первого экрана: их клип иначе
   * качался бы одновременно с клипом первой сцены и отбирал у него канал.
   */
  attachWhenNear?: boolean
  /**
   * Вместе с attachWhenNear: подписка на более ранний старт. Источник цепляется
   * по тому, что наступит раньше, — подход к окну или вызов start. Глава
   * «Грузим» так ждёт, пока докачается петля первого экрана (lib/heroLoopDone).
   * Возвращает отписку.
   */
  attachEarly?: (start: () => void) => () => void
}

export function useVideoScrub({
  progress,
  sectionRef,
  videoRef,
  blendRef,
  sources,
  enabled,
  onSample,
  onReady,
  onFrameCount,
  attachWhenNear = false,
  attachEarly,
}: Params) {
  const sampleRef = useRef(onSample)
  const readyRef = useRef(onReady)
  const framesRef = useRef(onFrameCount)
  sampleRef.current = onSample
  readyRef.current = onReady
  framesRef.current = onFrameCount

  useEffect(() => {
    const video = videoRef.current
    const blend = blendRef?.current ?? null
    const section = sectionRef.current
    if (!video || !section || !enabled) return

    const fps = sources.fps

    // --- Версия клипа выбирается ровно один раз ---------------------------
    // Смена src сбрасывает currentTime и заново запускает загрузку, поэтому
    // пересчёта по resize здесь нет и быть не должно.
    //
    // Источник цепляем не раньше полной загрузки страницы: клип весит мегабайты
    // и, начав качаться сразу, отбирает канал у постера и шрифтов — то есть
    // ровно у того, из чего складывается первое впечатление и LCP. Пока он
    // качается, на экране постер, так что ждать нечего.
    const attachSource = () => {
      // Адрес мог остаться от прошлого прогона эффекта — тогда не трогаем его.
      if (!video.getAttribute('src')) {
        const narrow = window.matchMedia(
          `(max-width: ${sources.narrowMaxWidth}px)`,
        ).matches
        video.src = narrow ? sources.narrow : sources.wide
      }
      // Замок автозапуска снимаем сразу с адресом, не дожидаясь жеста.
      unlock()
    }

    /*
     * Какой кадр каждый слой запросил последним и какой уже показывает.
     * Сравниваем с запросом, а не с video.currentTime: тот защёлкивается на
     * границу декодированного кадра. «Показывает» выставляет событие seeked:
     * до него на экране ещё прежний кадр, и растворять по нему нельзя.
     */
    let reqA = -1
    let shownA = -1
    let reqB = -1
    let shownB = -1

    // --- Обход политики автозапуска ---------------------------------------
    // Safari не отдаёт кадры и не даёт перематывать, пока воспроизведение не
    // было разрешено. Один тычок play()/pause() снимает замок; до этого на
    // экране остаётся постер.
    //
    // Между play() и его обещанием видео успевает реально проиграться — обычно
    // пара десятков миллисекунд. Поэтому после тычка слой забывает, какой кадр
    // показывает, и цикл на следующем же кадре выставляет его заново.
    const poke = (v: HTMLVideoElement, done: () => void) => {
      v.muted = true
      const started = v.play()
      if (started && typeof started.then === 'function') {
        started
          .then(() => {
            v.pause()
            done()
          })
          .catch(() => {
            // Жеста ещё не было — попробуем на следующем событии.
          })
      } else {
        try {
          v.pause()
        } catch {}
        done()
      }
    }

    let unlocked = false
    const unlock = () => {
      /*
       * Без адреса play() бесполезен: обещание висит до подстановки src. Для
       * сцены с attachWhenNear это означало бы новый play() и новое висящее
       * обещание на каждом событии скролла по всей странице выше неё. Адрес
       * появится — attachSource позовёт нас сам.
       */
      if (unlocked || !video.getAttribute('src')) return
      poke(video, () => {
        unlocked = true
        reqA = -1
        shownA = -1
        dropUnlockListeners()
      })
    }
    const dropUnlockListeners = () => {
      window.removeEventListener('touchstart', unlock)
      window.removeEventListener('scroll', unlock)
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('touchstart', unlock, { passive: true })
    window.addEventListener('scroll', unlock, { passive: true })
    window.addEventListener('click', unlock)
    window.addEventListener('keydown', unlock)

    // Подстановка источника — после объявления unlock: attachSource зовёт его
    // и может сработать здесь же, синхронно.
    let nearObserver: IntersectionObserver | null = null
    let dropEarly: (() => void) | undefined
    if (attachWhenNear) {
      let attached = false
      const go = () => {
        if (attached) return
        attached = true
        attachSource()
        nearObserver?.disconnect()
        dropEarly?.()
      }
      nearObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) go()
        },
        { rootMargin: '150% 0px' },
      )
      nearObserver.observe(section)
      dropEarly = attachEarly?.(go)
    } else if (document.readyState === 'complete') attachSource()
    else window.addEventListener('load', attachSource, { once: true })

    // --- Готовность --------------------------------------------------------
    const handleReady = () => readyRef.current?.()
    if (video.readyState >= 2) handleReady()
    else video.addEventListener('loadeddata', handleReady, { once: true })

    const onSeekedA = () => {
      if (!video.seeking) shownA = reqA
    }
    const onSeekedB = () => {
      if (blend && !blend.seeking) shownB = reqB
    }
    video.addEventListener('seeked', onSeekedA)
    blend?.addEventListener('seeked', onSeekedB)

    /*
     * Второй слой получает адрес, только когда первый скачал клип целиком:
     * тогда браузер отдаёт ему файл из кэша (Chrome — без единого запроса,
     * замер). Пока второго слоя нет, промотка работает одним, как раньше.
     */
    let blendAttached = false
    let blendUnlocked = false
    const attachBlend = () => {
      if (!blend || blendAttached) return
      blendAttached = true
      blend.preload = 'auto'
      blend.src = video.currentSrc || video.src
      const onMeta = () =>
        poke(blend, () => {
          blendUnlocked = true
          reqB = -1
          shownB = -1
        })
      if (blend.readyState >= 1) onMeta()
      else blend.addEventListener('loadedmetadata', onMeta, { once: true })
    }

    // --- Цикл --------------------------------------------------------------
    let raf = 0
    let running = false
    let lastSample = 0
    let frames = 0
    let prevF = -1
    let alpha = -1

    const seekTo = (v: HTMLVideoElement, m: number, duration: number) => {
      try {
        v.currentTime = Math.min((m + 0.5) / fps, Math.max(0, duration - END_EPSILON))
      } catch {
        // Перемотка до готовности метаданных — молча ждём следующего кадра.
      }
    }

    const setAlpha = (a: number) => {
      if (!blend || a === alpha) return
      alpha = a
      blend.style.opacity = String(a)
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)

      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) return

      if (!frames) {
        frames = Math.max(2, Math.round(duration * fps))
        framesRef.current?.(frames)
      }

      const p = clamp01(progress.get())
      // Позиция в кадрах, дробная: 0 — первый кадр, frames − 1 — последний.
      const F = p * (frames - 1)

      if (blend && !blendAttached && fullyBuffered(video)) attachBlend()
      const blendOn = blend !== null && blendUnlocked && blend.readyState >= 1

      if (video.readyState >= 1) {
        if (!blendOn) {
          const m = Math.round(F)
          if (m !== reqA) {
            reqA = m
            seekTo(video, m, duration)
          }
          setAlpha(0)
        } else {
          const n = Math.min(Math.floor(F), frames - 2)
          const even = n % 2 === 0 ? n : n + 1
          const odd = n % 2 === 0 ? n + 1 : n
          const fast = prevF >= 0 && Math.abs(F - prevF) > 1

          if (fast) {
            // Быстрый ход: растворять незачем, перематывается только слой
            // ближайшего кадра.
            const m = Math.round(F)
            if (m % 2 === 0) {
              if (m !== reqA) {
                reqA = m
                seekTo(video, m, duration)
              }
            } else if (m !== reqB) {
              reqB = m
              seekTo(blend, m, duration)
            }
          } else {
            if (even !== reqA) {
              reqA = even
              seekTo(video, even, duration)
            }
            if (odd !== reqB) {
              reqB = odd
              seekTo(blend, odd, duration)
            }
          }

          /*
           * Прозрачность верхнего слоя — по тому, что слои показывают на самом
           * деле. Растворяем, только когда на экране два соседних кадра и
           * позиция между ними; иначе (перемотка ещё не закончилась) виден
           * один слой — тот, чей кадр ближе к позиции.
           */
          const a = shownA
          const b = shownB
          if (a >= 0 && b >= 0 && Math.abs(a - b) === 1 && F >= Math.min(a, b) && F <= Math.max(a, b)) {
            setAlpha((F - a) / (b - a))
          } else if (b < 0) {
            setAlpha(0)
          } else if (a < 0) {
            setAlpha(1)
          } else {
            setAlpha(Math.abs(b - F) < Math.abs(a - F) ? 1 : 0)
          }
        }
      }
      prevF = F

      const now = performance.now()
      if (sampleRef.current && now - lastSample >= SAMPLE_INTERVAL_MS) {
        lastSample = now
        sampleRef.current(p)
      }
    }

    const start = () => {
      if (running || document.hidden) return
      running = true
      prevF = -1
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (!running) return
      running = false
      cancelAnimationFrame(raf)
    }

    // Вне вьюпорта цикл спит: перематывать то, чего не видно, незачем.
    let onScreen = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        if (onScreen) start()
        else stop()
      },
      { threshold: 0 },
    )
    observer.observe(section)

    const onVisibility = () => {
      if (document.hidden) stop()
      else if (onScreen) start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('load', attachSource)
      nearObserver?.disconnect()
      dropEarly?.()
      dropUnlockListeners()
      video.removeEventListener('loadeddata', handleReady)
      video.removeEventListener('seeked', onSeekedA)
      blend?.removeEventListener('seeked', onSeekedB)
    }
  }, [enabled, progress, sectionRef, videoRef, blendRef, sources, attachWhenNear, attachEarly])
}
