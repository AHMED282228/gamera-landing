'use client'

import { useCallback, useRef, useState } from 'react'
import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react'

import { UNLOAD_AMBIENT } from '@/lib/ambient'
import { UNLOAD_MEDIA, UNLOAD_POSTER, UNLOAD_POSTER_ALT } from '@/lib/config'
import { REVEAL, UNLOAD_CAPTIONS } from '@/lib/scrubTimeline'
import { useSmoothProgress } from '@/lib/useSmoothProgress'
import { useVideoScrub } from '@/lib/useVideoScrub'

import { ScrubCaption } from './ScrubCaption'
import { SceneAmbient } from './ScrubStage'

/**
 * Вторая сцена «Довезли» — продолжение первой: там машину забрали, здесь её
 * выгружают. Устроена так же (прокрутка задаёт время клипа), но короче — 300vh.
 *
 * Вход: секция въезжает тёмной, затем кадр проступает из темноты кругом от
 * стоп-сигналов BMW. Круг — это затемнение с прозрачной серединой, а не маска:
 * так нет зависимости от префиксов mask-image, а без JS слой просто прячется.
 */
export function UnloadStage() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const blendRef = useRef<HTMLVideoElement>(null)
  const [steps, setSteps] = useState(0)
  const [videoReady, setVideoReady] = useState(false)
  const reduced = useReducedMotion()

  // Числовой offset — по той же причине, что и в ScrubStage (см. там).
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: [0, 1] })
  // Сглаженный прогресс — как в ScrubStage (см. там и lib/useSmoothProgress.ts).
  const progress = useSmoothProgress(scrollYProgress, !reduced, steps)

  /*
   * Радиус светлого круга в процентах луча градиента. На старте открыты
   * только стоп-сигналы — они видны уже пока секция въезжает в окно, так что
   * полностью чёрного экрана не бывает; к 125 темнота уходит за углы кадра.
   * Кривая с медленным началом: человек успевает заметить огни. Край мягкий
   * (32%), иначе круг читается как подзорная труба.
   */
  const radius = useTransform(
    progress,
    [REVEAL.from, REVEAL.from + (REVEAL.to - REVEAL.from) * 0.35, REVEAL.to],
    [0, 8, 125],
    { clamp: true },
  )
  const veil = useMotionTemplate`radial-gradient(circle at var(--lx) var(--ly), rgb(11 7 15 / 0) ${radius}%, var(--color-bg) calc(${radius}% + 32%))`
  /* Свет за кадром разгорается вслед за кругом, а не горит с самого начала:
     иначе вокруг тёмного кадра висело бы светлое облако неба. */
  const ambCover = useTransform(
    progress,
    [REVEAL.from + (REVEAL.to - REVEAL.from) * 0.35, REVEAL.to],
    [1, 0],
    { clamp: true },
  )

  const handleReady = useCallback(() => setVideoReady(true), [])
  const handleFrames = useCallback((n: number) => setSteps(n - 1), [])

  useVideoScrub({
    progress,
    sectionRef,
    videoRef,
    blendRef,
    sources: UNLOAD_MEDIA,
    enabled: !reduced,
    onReady: handleReady,
    onFrameCount: handleFrames,
    attachWhenNear: true,
  })

  return (
    <section
      ref={sectionRef}
      id="delivered"
      aria-label="Как выглядит выгрузка"
      className="scrub-section scrub-section--unload relative h-[300vh]"
    >
      <div className="scrub-stage scrub-stage--unload sticky top-0 h-[100svh] overflow-hidden bg-bg">
        <SceneAmbient src={UNLOAD_AMBIENT} cover={ambCover} />
        <div className="scrub-stage-media absolute inset-0">
          <div className="scrub-frame">
            <img
              src={UNLOAD_POSTER.src}
              srcSet={UNLOAD_POSTER.srcSet}
              sizes={UNLOAD_POSTER.sizes}
              width={1280}
              height={720}
              alt={UNLOAD_POSTER_ALT}
              loading="lazy"
              decoding="async"
            />
            <video
              ref={videoRef}
              playsInline
              muted
              preload="auto"
              aria-hidden="true"
              tabIndex={-1}
              style={{ opacity: videoReady ? 1 : 0 }}
            />
            {/* Второй слой для растворения кадров — как в ScrubStage. */}
            <div
              className="absolute inset-0"
              aria-hidden="true"
              style={{ opacity: videoReady ? 1 : 0 }}
            >
              <video
                ref={blendRef}
                className="scrub-blend"
                playsInline
                muted
                preload="none"
                tabIndex={-1}
                style={{ opacity: 0 }}
              />
            </div>

            {/* Темнота, из которой кадр проступает от стоп-сигналов. Слой есть
                всегда, при prefers-reduced-motion и без JS его прячет CSS
                (.scrub-reveal): условный рендер по reduced расходился бы с
                серверной разметкой (см. .scrub-dim в ScrubStage). */}
            <motion.div
              className="scrub-reveal pointer-events-none absolute inset-0"
              style={{ background: veil }}
            />
          </div>
        </div>


        <div className="scrub-copy">
          {UNLOAD_CAPTIONS.map((c) => (
            <ScrubCaption
              key={c.title}
              progress={progress}
              from={c.from}
              to={c.to}
              title={c.title}
              text={c.text}
            />
          ))}
        </div>

      </div>
    </section>
  )
}
