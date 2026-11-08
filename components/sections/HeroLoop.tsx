'use client'

import { useEffect, useRef, useState } from 'react'

import { LOOP, MEDIA, POSTER, POSTER_ALT, SHOT_SIZE } from '@/lib/config'
import { attachLoop } from '@/lib/gaplessLoop'
import { markHeroLoopDone } from '@/lib/heroLoopDone'

type Conn = { saveData?: boolean; effectiveType?: string }

/** Сколько ждать петлю, прежде чем всё равно пустить загрузку главы «Грузим». */
const QUEUE_LIMIT_MS = 20000

/**
 * Какой файл петли взять.
 *
 * Компьютер — большой, как раньше. Телефон — тоже большой, если кадр на его
 * экране выше узкого файла (480 точек): кадр здесь шире экрана (130vw), и на
 * iPhone 14 он 751 точку в высоту — узкий файл растянут в 1,6 раза. Замер на
 * этом размере: узкий оставляет 41% дождя и 72% резкости, большой — 84% и 99%,
 * а постер под петлёй и так большой, поэтому с узкой петлёй кадр мылился в миг
 * её появления.
 *
 * Слабая связь (Chrome считает её 3G) — узкий везде: он вчетверо легче и
 * пускает петлю на секунды раньше (слабый 4G: 8,0 с вместо 10,4 на телефоне,
 * 8,6 вместо 20,6 на компьютере). downlink не годится: Chrome без замеров
 * отдаёт 1,3–1,6 Мбит/с и на хорошей связи. iPhone связь не сообщает — получает
 * большой.
 */
function pickLoop(video: HTMLVideoElement, conn: Conn | undefined) {
  if (/(^|-)(2g|3g)$/.test(conn?.effectiveType ?? '')) return LOOP.narrow
  if (!window.matchMedia(`(max-width: ${MEDIA.narrowMaxWidth}px)`).matches) return LOOP.wide
  const px = video.getBoundingClientRect().height * (window.devicePixelRatio || 1)
  return px > 560 ? LOOP.wide : LOOP.narrow
}

/**
 * Кадр первого экрана: постер сразу, поверх него — живая петля (дождь,
 * маячок), когда страница загрузилась. Стык круга без рывка (lib/gaplessLoop).
 * При «уменьшить движение» и экономии трафика остаётся постер.
 *
 * Пока петля качается, клип главы «Грузим» ждёт (lib/heroLoopDone): иначе он
 * делил бы с ней канал.
 */
export function HeroLoop() {
  const ref = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const afterLoad = (fn: () => void) => {
      if (document.readyState === 'complete') fn()
      else window.addEventListener('load', fn, { once: true })
      return () => window.removeEventListener('load', fn)
    }
    // Петли не будет — глава может качаться сразу после страницы.
    if (!LOOP.enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return afterLoad(markHeroLoopDone)
    }
    const conn = (navigator as Navigator & { connection?: Conn }).connection
    // Экономия трафика и 2G: ни петли, ни ранней загрузки главы — её клип
    // качается только при подходе к ней.
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return

    let detach: (() => void) | undefined
    let limit = 0
    const attach = () => {
      if (video.getAttribute('src')) return
      video.preload = 'auto'
      detach = attachLoop(video, pickLoop(video, conn))
      limit = window.setTimeout(markHeroLoopDone, QUEUE_LIMIT_MS)
    }
    const unload = afterLoad(attach)

    const on = () => {
      setReady(true)
      markHeroLoopDone()
    }
    video.addEventListener('playing', on)
    video.addEventListener('error', markHeroLoopDone)
    return () => {
      unload()
      window.clearTimeout(limit)
      video.removeEventListener('playing', on)
      video.removeEventListener('error', markHeroLoopDone)
      detach?.()
    }
  }, [])

  return (
    <>
      <img
        className="hero-static__img"
        src={POSTER.src}
        srcSet={POSTER.srcSet}
        sizes="(min-width: 769px) 70vw, 100vw"
        width={SHOT_SIZE.w}
        height={SHOT_SIZE.h}
        alt={POSTER_ALT}
        fetchPriority="high"
        decoding="async"
      />
      <video
        ref={ref}
        className="hero-static__img"
        playsInline
        muted
        loop
        autoPlay
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        style={{ opacity: ready ? 1 : 0, transition: 'opacity 400ms linear' }}
      />
    </>
  )
}
