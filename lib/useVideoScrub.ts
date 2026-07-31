'use client'

import { useEffect, useRef, type RefObject } from 'react'
import type { MotionValue } from 'motion/react'

/**
 * Доля расстояния до цели, съедаемая за кадр. Без этого сглаживания промотка
 * дёргается на трекпаде: события скролла приходят рваными пачками, и время
 * видео прыгает вслед за ними. Значение подобрано в брифе, не трогать наугад.
 */
const SMOOTHING = 0.12

/** Ближе этого к цели считаем, что доехали, и перестаём дёргать currentTime. */
const SETTLED = 0.0005

/**
 * Торможение на подъезде к цели: шаг за кадр не меньше BRAKE * √расстояние.
 *
 * Зачем это вообще. Экспонента к цели не приходит никогда — она съедает долю
 * остатка, поэтому последние проценты пути тянутся столько же, сколько первые
 * девяносто. Хвост при 0.12 живёт восемь десятых секунды, и всё это время шаг
 * меньше порога перемотки: запросы не уходят, копятся и вылетают пачкой. На
 * глаз — «замер, дёрнулся, замер».
 *
 * Почему именно корень, а не постоянная скорость. Постоянная убирает паузы, но
 * обрывается в ноль — вместо подёргивания получается рывок в самом конце.
 * Корень даёт равнозамедленный подъезд: скорость плавно гаснет и всё-таки
 * обращается в ноль за конечное время, как машина, тормозящая ровным нажатием.
 *
 * Замер на остановке с 0.30 с до цели, экран 60 Гц:
 *
 *   экспонента        833 мс, паузы до 12 кадров, скорость в конце 0.1 мс/кадр
 *   ровная скорость   233 мс, пауз нет, но обрыв с 16.7 сразу в ноль
 *   торможение 0.03   433 мс, паузы до 3 кадров, конец 3.4 → 2.4 → 1.4 → 0.8
 *
 * Дальше 0.06 с до цели всё считает по-прежнему экспонента, поэтому рваные
 * пачки событий от трекпада сглаживаются как и раньше.
 */
const BRAKE = 0.03

/**
 * Минимальный шаг между запросами перемотки. Сравниваем с прошлым *запросом*,
 * а не с video.currentTime: тот защёлкивается на границу декодированного кадра,
 * и сравнение с ним держало бы разницу всегда ненулевой — видео перематывалось
 * бы на каждом кадре rAF даже в полном покое.
 */
const MIN_SEEK_STEP = 1 / 120

/**
 * Не доводим до самого конца дорожки: перемотка ровно в duration в части
 * браузеров роняет картинку в пустой кадр.
 *
 * Значение заведомо меньше длительности кадра при любой разумной частоте
 * (20 мс — это 50 к/с), поэтому последний кадр остаётся виден и после замены
 * клипа на другой. Частоту кадров тут знать неоткуда и завязываться на неё
 * нельзя: видео — сменный файл.
 */
const END_EPSILON = 0.02

/** Частота отчётов для HUD — не чаще 10 раз в секунду. */
const SAMPLE_INTERVAL_MS = 100

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

type Params = {
  /** Прогресс секции 0..1 от useScroll. */
  progress: MotionValue<number>
  sectionRef: RefObject<HTMLElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  sources: { wide: string; narrow: string; narrowMaxWidth: number }
  /** false при prefers-reduced-motion — тогда видео не грузится вовсе. */
  enabled: boolean
  /** Вызывается не чаще 10 Гц с текущим прогрессом. */
  onSample?: (progress: number) => void
  /** Первый декодированный кадр на экране — можно показывать видео. */
  onReady?: () => void
}

export function useVideoScrub({
  progress,
  sectionRef,
  videoRef,
  sources,
  enabled,
  onSample,
  onReady,
}: Params) {
  const sampleRef = useRef(onSample)
  const readyRef = useRef(onReady)
  sampleRef.current = onSample
  readyRef.current = onReady

  useEffect(() => {
    const video = videoRef.current
    const section = sectionRef.current
    if (!video || !section || !enabled) return

    // --- Версия клипа выбирается ровно один раз ---------------------------
    // Смена src сбрасывает currentTime и заново запускает загрузку, поэтому
    // пересчёта по resize здесь нет и быть не должно.
    //
    // Источник цепляем не раньше полной загрузки страницы: клип весит мегабайты
    // и, начав качаться сразу, отбирает канал у постера и шрифтов — то есть
    // ровно у того, из чего складывается первое впечатление и LCP. Пока он
    // качается, на экране постер, так что ждать нечего.
    const attachSource = () => {
      if (video.getAttribute('src')) return
      const narrow = window.matchMedia(
        `(max-width: ${sources.narrowMaxWidth}px)`,
      ).matches
      video.src = narrow ? sources.narrow : sources.wide
    }
    if (document.readyState === 'complete') attachSource()
    else window.addEventListener('load', attachSource, { once: true })

    /**
     * Последнее время, которое мы сами запросили у видео. Объявлено до обхода
     * автозапуска, потому что тот двигает currentTime мимо нас и должен уметь
     * сбросить эту память.
     */
    let lastRequested = -1

    // --- Обход политики автозапуска ---------------------------------------
    // Safari не отдаёт кадры и не даёт перематывать, пока воспроизведение не
    // было разрешено. Один тычок play()/pause() снимает замок; до этого на
    // экране остаётся постер.
    let unlocked = false
    const unlock = () => {
      if (unlocked) return
      video.muted = true
      const started = video.play()
      if (started && typeof started.then === 'function') {
        started
          .then(() => {
            unlocked = true
            video.pause()
            invalidateRequested()
            dropUnlockListeners()
          })
          .catch(() => {
            // Жеста ещё не было — попробуем на следующем событии.
          })
      } else {
        unlocked = true
        try {
          video.pause()
        } catch {}
        invalidateRequested()
        dropUnlockListeners()
      }
    }

    /**
     * Между play() и его обещанием видео успевает реально проиграться — обычно
     * пара десятков миллисекунд, то есть примерно полкадра. Цикл этого не видит:
     * он сравнивает не с фактическим временем видео, а со своим последним
     * запросом, и остаётся в уверенности, что стоит там, где надо.
     *
     * Сравнивать с video.currentTime вместо этого нельзя: оно защёлкивается на
     * границу декодированного кадра, и разница никогда не станет нулевой —
     * видео начало бы перематываться на каждом кадре rAF даже в покое.
     *
     * Поэтому обход просто забывает последний запрос, и цикл на следующем же
     * кадре выставляет время заново.
     */
    const invalidateRequested = () => {
      lastRequested = -1
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
    unlock()

    // --- Готовность --------------------------------------------------------
    const handleReady = () => readyRef.current?.()
    if (video.readyState >= 2) handleReady()
    else video.addEventListener('loadeddata', handleReady, { once: true })

    // --- Цикл --------------------------------------------------------------
    let raf = 0
    let running = false
    let primed = false
    let current = 0
    let lastSample = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)

      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) return

      const p = clamp01(progress.get())
      const target = p * Math.max(0, duration - END_EPSILON)

      if (!primed) {
        // Страницу могли перезагрузить в середине секции — заходим сразу на
        // нужный кадр, иначе видео проматывалось бы от нуля на глазах.
        primed = true
        current = target
      } else {
        const delta = target - current
        const distance = Math.abs(delta)
        // Доля остатка, но не медленнее торможения и не мимо цели.
        const step = Math.min(
          distance,
          Math.max(distance * SMOOTHING, BRAKE * Math.sqrt(distance)),
        )
        current += Math.sign(delta) * step
        if (Math.abs(target - current) < SETTLED) current = target
      }

      if (
        video.readyState >= 1 &&
        Math.abs(current - lastRequested) > MIN_SEEK_STEP
      ) {
        lastRequested = current
        try {
          video.currentTime = current
        } catch {
          // Перемотка до готовности метаданных — молча ждём следующего кадра.
        }
      }

      const now = performance.now()
      if (sampleRef.current && now - lastSample >= SAMPLE_INTERVAL_MS) {
        lastSample = now
        sampleRef.current(p)
      }
    }

    const start = () => {
      if (running || document.hidden) return
      running = true
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
      dropUnlockListeners()
      video.removeEventListener('loadeddata', handleReady)
    }
  }, [enabled, progress, sectionRef, videoRef, sources])
}
