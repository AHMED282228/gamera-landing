'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'

import { AMBIENT, AMBIENT_WIDE } from '@/lib/ambient'
import { LOOP, MEDIA, POSTER, POSTER_ALT, SHOT_SIZE, WIDE_SHOT } from '@/lib/config'
import { attachLoop } from '@/lib/gaplessLoop'
import { onHeroLoopDone } from '@/lib/heroLoopDone'
import { CAPTIONS } from '@/lib/scrubTimeline'
import { useSmoothProgress } from '@/lib/useSmoothProgress'
import { useVideoScrub } from '@/lib/useVideoScrub'

import { HeadlightWindow } from './HeadlightWindow'
import { HeroCopy } from './HeroCopy'
import { ScrubCaption } from './ScrubCaption'

/**
 * Ядро страницы: скролл по секции задаёт время клипа, а не запускает его.
 * Секция вчетверо выше окна, внутри — залипающий кадр на всю высоту.
 */
export function ScrubStage({ chapter = false }: { chapter?: boolean } = {}) {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const blendRef = useRef<HTMLVideoElement>(null)
  /** Кадров в клипе минус один — шаг, на котором останавливается промотка. */
  const [steps, setSteps] = useState(0)
  const loopRef = useRef<HTMLVideoElement>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [loopReady, setLoopReady] = useState(false)
  /**
   * Человек ещё не тронул колесо. Пока так — сверху крутится петля; как только
   * тронул, её место занимает промотка. Возвращается обратно при возврате
   * наверх, иначе первый экран после отката оставался бы мёртвым.
   */
  const [atStart, setAtStart] = useState(true)

  const reduced = useReducedMotion()

  /*
   * Offset задан числами намеренно, и менять запись на привычную
   * ['start start', 'end end'] нельзя, хотя значит она ровно то же самое.
   *
   * Motion сопоставляет строковую форму со своим пресетом All и подменяет
   * JS-отслеживание нативной анимацией на ViewTimeline с диапазоном contain.
   * Для секции в 400vh с залипающим блоком внутри этот диапазон считается
   * иначе: прогресс идёт назад и в сжатом интервале, из-за чего первый экран
   * не гаснет, а начинает проступать обратно. Ломается это молча — значение
   * MotionValue остаётся верным, подменяется только то, что видно на экране.
   *
   * Числовая форма ни под один пресет не подходит, и библиотека сама
   * возвращается на JS-путь. Регрессию стережёт scripts/check-modes.mjs:
   * он падает, если на текстовых слоях появляется нативная анимация.
   */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: [0, 1],
  })
  /* Всё в кадре живёт от сглаженного значения, а не от сырой прокрутки:
     щелчок колеса раскатывается плавно, и клип с текстом едут вместе
     (lib/useSmoothProgress.ts). */
  const progress = useSmoothProgress(scrollYProgress, !reduced, steps)

  /*
   * Уход из сцены: на последней седьмой части прокрутки кадр медленно
   * наезжает на хвост платформы и гаснет — «машину забрали, везём». Темнота
   * подхватывается второй сценой, которая из неё же и проступает.
   */
  const zoom = useTransform(progress, [0.86, 1], [1, 1.16], { clamp: true })
  const dim = useTransform(progress, [0.92, 1], [0, 0.9], { clamp: true })
  const handleSample = useCallback((p: number) => {
    // Порог, а не строгий ноль: прогресс дрожит на доли процента от инерции
    // прокрутки, и на строгом сравнении слои начали бы мигать друг через друга.
    setAtStart((prev) => {
      const next = p < 0.004
      return next === prev ? prev : next
    })
  }, [])

  const handleReady = useCallback(() => setVideoReady(true), [])
  const handleFrames = useCallback((n: number) => setSteps(n - 1), [])

  useVideoScrub({
    progress,
    sectionRef,
    videoRef,
    blendRef,
    sources: MEDIA,
    enabled: !reduced,
    onSample: handleSample,
    onReady: handleReady,
    onFrameCount: handleFrames,
    // Глава ниже первого экрана: клип ждёт петлю первого экрана или подхода к окну.
    attachWhenNear: chapter,
    attachEarly: chapter ? onHeroLoopDone : undefined,
  })

  /*
   * Петля. Источник цепляется после полной загрузки страницы — по той же
   * причине, что и у промотки: пока качается видео, на экране постер, и
   * отбирать канал у него самого нечестно.
   *
   * preload="none" в разметке, а не "auto": иначе браузер начнёт качать петлю
   * сразу, до постера, и первый экран появится позже.
   */
  useEffect(() => {
    const video = loopRef.current
    if (!video || reduced || !LOOP.enabled) return

    /*
     * Экономия трафика («Упрощённый режим» Chrome, Opera) и сеть 2G: петля —
     * украшение первого экрана, а не содержание, и до 0,8 МБ за неё человек
     * платит своим трафиком или ждёт дольше главного — промотки. Постер стоит
     * на месте петли и так, а промотка грузится как обычно.
     */
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return

    /*
     * preload переключается на 'auto' здесь, а не в разметке. С 'none' браузер
     * не начинает качать файл даже после подстановки адреса — он ждёт запроса
     * на воспроизведение. А запрос мы делаем только когда файл загрузился,
     * то есть никогда. Load() нужен по той же причине: без него смена preload
     * ничего не запускает (его делает attachLoop на обычном пути).
     *
     * Источник подставляет attachLoop: круги подкладываются в плеер подряд, без
     * перемотки, поэтому нет рывка на стыке круга (см. lib/gaplessLoop.ts).
     */
    let detach: (() => void) | undefined
    const attach = () => {
      if (video.getAttribute('src')) return
      const narrow = window.matchMedia(
        `(max-width: ${MEDIA.narrowMaxWidth}px)`,
      ).matches
      video.preload = 'auto'
      detach = attachLoop(video, narrow ? LOOP.narrow : LOOP.wide)
    }
    // Глава ниже первого экрана — по той же очереди, что и её клип: когда
    // докачалась петля первого экрана или глава подошла к окну (lib/heroLoopDone).
    let near: IntersectionObserver | null = null
    let dropEarly: (() => void) | undefined
    const section = sectionRef.current
    if (chapter && section) {
      const go = () => {
        near?.disconnect()
        dropEarly?.()
        attach()
      }
      near = new IntersectionObserver(([e]) => e.isIntersecting && go(), { rootMargin: '150% 0px' })
      near.observe(section)
      dropEarly = onHeroLoopDone(go)
    } else if (document.readyState === 'complete') attach()
    else window.addEventListener('load', attach, { once: true })

    const ready = () => setLoopReady(true)
    if (video.readyState >= 2) ready()
    video.addEventListener('loadeddata', ready)
    video.addEventListener('canplay', ready)

    return () => {
      window.removeEventListener('load', attach)
      near?.disconnect()
      dropEarly?.()
      video.removeEventListener('loadeddata', ready)
      video.removeEventListener('canplay', ready)
      detach?.()
    }
  }, [reduced, chapter])

  /*
   * Пока петля видна — она играет, как только её закрыла промотка — стоит.
   * Дело не в производительности рисования (закрытый слой всё равно не
   * рисуется), а в декодере: на телефоне он греет батарею и на неподвижной
   * странице работать не должен.
   */
  useEffect(() => {
    const video = loopRef.current
    if (!video) return
    if (atStart && loopReady && !reduced) {
      const started = video.play()
      if (started && typeof started.then === 'function') started.catch(() => {})
    } else {
      video.pause()
    }
  }, [atStart, loopReady, reduced])

  return (
    <section ref={sectionRef} id={chapter ? 'loading' : undefined} className="scrub-section relative h-[400vh]">
      <div
        ref={stageRef}
        className={`scrub-stage${WIDE_SHOT ? ' scrub-stage--wide' : ''} sticky top-0 h-[100svh] overflow-hidden bg-bg`}
      >
        {/*
          Кадр показывается целиком и прижат к правому краю окна, а слева
          остаётся чистое поле под текст.

          Клип при этом не растягивается: его ширина ограничена сверху родными
          1280px. Прежняя заливка на всё окно тянула его в 1.25–1.67 раза,
          отсюда и брался мыльный вид. На широком мониторе кадр просто не
          доходит до текста, отдавая полю больше места.

          Параметры кадрирования — в переменных `.scrub-stage` в globals.css,
          оттуда же их перенастраивает медиазапрос для узких экранов.
        */}
        <SceneAmbient src={WIDE_SHOT ? AMBIENT_WIDE : AMBIENT} cover={dim} />
        <div className="scrub-stage-media absolute inset-0">
          <div className="scrub-frame">
            <motion.div
              className="scrub-zoom absolute inset-0"
              style={reduced ? undefined : { scale: zoom }}
            >
              {/*
                Постер и видео — два слоя одной геометрии: общий бокс, общий
                object-fit. Поэтому подмена не сдвигает картинку — постер вырезан
                из первого кадра этого же клипа и совпадает с ним пиксельно.
              */}
              {/*
                Постер — элемент LCP, и приоритет ему поднимается здесь, на самой
                картинке. Ссылку preload в <head> руками писать не надо: React
                выпускает её сам за каждую отрисованную на сервере картинку и
                переносит в неё fetchPriority.

                Написанная руками ссылка не просто дублировала React-овскую, а
                проигрывала ей: браузер брал ту, что стоит в <head> раньше, а
                раньше стоит React-овская. Пока приоритет был только в ручной
                ссылке, он не применялся вовсе — Lighthouse ловил это как
                «fetchpriority=high should be applied to the image preload
                request», хотя в разметке слово fetchPriority присутствовало.

                Размеры проставлены собственными пропорциями кадра: вёрстка их не
                использует (бокс держит aspect-ratio), но без них картинка
                считается нулевой до загрузки, и это уходит в CLS.
              */}
              <img
                src={POSTER.src}
                srcSet={POSTER.srcSet}
                sizes={POSTER.sizes}
                width={SHOT_SIZE.w}
                height={SHOT_SIZE.h}
                alt={POSTER_ALT}
                fetchPriority={chapter ? 'auto' : 'high'}
                loading={chapter ? 'lazy' : undefined}
                decoding="async"
              />
              {/*
                Петля лежит между постером и промоткой и просто закрывается ею
                сверху. Прятать её при этом не нужно: слой под непрозрачным слоем
                не виден и так, а если её гасить одновременно с проявлением
                промотки, то в середине перехода оба видео окажутся полупрозрачными
                и сквозь них проступит постер — то есть на долю секунды дождь
                удвоится. Именно так выглядели неудачные варианты смыкания петли.
              */}
              <video
                ref={loopRef}
                playsInline
                muted
                loop
                autoPlay
                preload="none"
                aria-hidden="true"
                tabIndex={-1}
                style={{
                  opacity: !reduced && loopReady ? 1 : 0,
                  transition: 'opacity 300ms linear',
                }}
              />
              {/*
                Атрибута poster у видео намеренно нет: постер уже лежит слоем ниже,
                а второй такой же атрибут заставил бы браузер скачать картинку
                второй раз — и, при отзывчивом srcset, вероятно другого размера.
              */}
              <video
                ref={videoRef}
                playsInline
                muted
                preload="auto"
                aria-hidden="true"
                tabIndex={-1}
                /*
                  Короткое растворение, 160 мс. Раньше подмена была мгновенной:
                  петля и промотка росли из разных кадров, технику нейросеть
                  перерисовала, и при растворении машина перетекала из формы в
                  форму. Теперь обе нарезаны из одного ролика, машины одни и те
                  же, а разница на стыке — капли, блики асфальта и фаза маячка
                  (в 2,5–5 раз больше обычной смены кадра). Резкая подмена дала
                  бы вспышку, растворение её сглаживает. Петля под промоткой
                  остаётся непрозрачной, так что постер сквозь них не проступает.
                */
                style={{
                  opacity: videoReady && !atStart ? 1 : 0,
                  transition: reduced ? 'none' : 'opacity 160ms linear',
                }}
              />
              {/*
                Второй слой того же клипа — нечётные кадры. Промотка растворяет
                его поверх первого, и на медленном ходу картинка меняется на
                каждом кадре экрана, а не ступеньками раз в 0,1 с (см.
                lib/useVideoScrub.ts). Прозрачность самого видео ставит хук,
                поэтому React её здесь не задаёт — иначе затёр бы при
                перерисовке; показ и скрытие вместе с первым слоем — на обёртке.
                Адрес появляется, только когда первый слой скачал клип целиком.
              */}
              <div
                className="absolute inset-0"
                aria-hidden="true"
                style={{
                  opacity: videoReady && !atStart ? 1 : 0,
                  transition: reduced ? 'none' : 'opacity 160ms linear',
                }}
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
              {/*
                Точка фары — внутри слоя наезда: в конце сцены кадр приближается,
                и свет за подписью (HeadlightWindow) едет вместе с фарой.
              */}
              <span className="scrub-lamp" aria-hidden="true" />
            </motion.div>

            {/*
              Слой есть в разметке всегда, а при prefers-reduced-motion его
              прячет CSS (.scrub-dim). Условие {!reduced && …} здесь нельзя:
              на сборке reduced неизвестен (null), и у кого движение выключено,
              разметка с сервера и с клиента расходится — React выбрасывает
              серверный HTML и перерисовывает страницу заново.
            */}
            <motion.div
              className="scrub-dim pointer-events-none absolute inset-0 bg-bg"
              style={{ opacity: dim }}
            />
          </div>
          <HeadlightWindow progress={progress} stageRef={stageRef} enabled={!reduced} />
        </div>

        {/*
          Одно текстовое поле на всю секцию: сначала первый экран, затем на его
          месте подписи — каждая ниже предыдущей. Шкалы и строки этапов нет:
          владелец счёл их лишними, подписи сами показывают, где ты.
          На компьютере под полем ровный тёмный фон, а за подписями фара
          высвечивает в нём клип (HeadlightWindow).
        */}
        <div className="scrub-copy">
          <HeroCopy progress={progress} chapter={chapter} />
          {CAPTIONS.map((c) => (
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

/**
 * Свет сцены за кадром. Раньше кадр гасили четыре тёмные полосы по краям, и
 * он читался прямоугольником, вырезанным в чёрном: фары, маячок и небо
 * обрывались ровной темнотой. Теперь за кадром лежит та же картинка, сильно
 * размытая и притушенная, а сам кадр уходит в неё мягкой маской
 * (.scrub-frame в globals.css) — свет фар и неба как бы продолжается за край и
 * гаснет постепенно, как в темноте настоящей ночью.
 *
 * Картинка — копия постера 64×36, встроенная в страницу (около 1 КБ): видна
 * сразу, без запроса, и не перебивает постер в замере LCP, как перебивала
 * размытая полноразмерная копия (см. scripts/make-ambient.mjs). Размытие
 * неподвижно и рисуется один раз: затемнение в конце сцены и
 * проявление второй сцены идут отдельной заливкой сверху (cover), а не
 * прозрачностью самого размытого слоя — иначе браузер пересчитывал бы размытие
 * на каждом кадре прокрутки.
 *
 * Лежит до .scrub-stage-media, а не внутри: проверки берут первую картинку
 * оттуда как постер. Без JS и при prefers-reduced-motion слои прячет CSS —
 * секция там разворачивается в поток, и свет за кадром встал бы мимо него.
 */
export function SceneAmbient({
  src,
  cover,
}: {
  /** Крошечная копия постера из lib/ambient.ts (scripts/make-ambient.mjs). */
  src: string
  /** Непрозрачность притушающей заливки поверх света, 0…1. */
  cover: MotionValue<number>
}) {
  return (
    <>
      {/* Продолжение света влево, до шкалы: та же копия, шире. Лежит под
          основным светом и под его затемнением (.scrub-amb-shade), поэтому
          выглядит так же, как свет у края кадра. Видно лишь в окне фары
          (HeadlightWindow), в остальном его закрывает ровный тёмный фон; без
          света фары спрятано CSS-ом. */}
      <div className="scrub-amb scrub-amb--lamp" aria-hidden="true">
        <img src={src} width={64} height={36} alt="" decoding="async" />
      </div>
      <div className="scrub-amb" aria-hidden="true">
        <img src={src} width={64} height={36} alt="" decoding="async" />
      </div>
      <div className="scrub-amb-shade" aria-hidden="true" />
      <motion.div
        className="scrub-amb-cover pointer-events-none absolute inset-0 bg-bg"
        aria-hidden="true"
        style={{ opacity: cover }}
      />
    </>
  )
}
