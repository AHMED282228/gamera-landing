'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion, useScroll } from 'motion/react'

import { LOOP, MEDIA, POSTER, POSTER_ALT } from '@/lib/config'
import { CAPTIONS, phaseAt } from '@/lib/scrubTimeline'
import { useVideoScrub } from '@/lib/useVideoScrub'

import { HeroCopy } from './HeroCopy'
import { PhaseRail } from './PhaseRail'
import { ScrubCaption } from './ScrubCaption'

/**
 * Ядро страницы: скролл по секции задаёт время клипа, а не запускает его.
 * Секция вчетверо выше окна, внутри — залипающий кадр на всю высоту.
 */
export function ScrubStage() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const loopRef = useRef<HTMLVideoElement>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [loopReady, setLoopReady] = useState(false)
  const [percent, setPercent] = useState(0)
  const [phase, setPhase] = useState('—')
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

  const handleSample = useCallback((p: number) => {
    // Хук зовёт нас не чаще 10 Гц, но и там перерисовка нужна только когда
    // округлённое значение действительно изменилось.
    setPercent((prev) => {
      const next = Math.round(p * 100)
      return next === prev ? prev : next
    })
    setPhase((prev) => {
      const next = phaseAt(p)
      return next === prev ? prev : next
    })
    // Порог, а не строгий ноль: прогресс дрожит на доли процента от инерции
    // прокрутки, и на строгом сравнении слои начали бы мигать друг через друга.
    setAtStart((prev) => {
      const next = p < 0.004
      return next === prev ? prev : next
    })
  }, [])

  const handleReady = useCallback(() => setVideoReady(true), [])

  useVideoScrub({
    progress: scrollYProgress,
    sectionRef,
    videoRef,
    sources: MEDIA,
    enabled: !reduced,
    onSample: handleSample,
    onReady: handleReady,
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
    if (!video || reduced) return

    /*
     * preload переключается на 'auto' здесь, а не в разметке. С 'none' браузер
     * не начинает качать файл даже после подстановки адреса — он ждёт запроса
     * на воспроизведение. А запрос мы делаем только когда файл загрузился,
     * то есть никогда. Load() нужен по той же причине: без него смена preload
     * ничего не запускает.
     */
    const attach = () => {
      if (video.getAttribute('src')) return
      const narrow = window.matchMedia(
        `(max-width: ${MEDIA.narrowMaxWidth}px)`,
      ).matches
      video.preload = 'auto'
      video.src = narrow ? LOOP.narrow : LOOP.wide
      video.load()
    }
    if (document.readyState === 'complete') attach()
    else window.addEventListener('load', attach, { once: true })

    const ready = () => setLoopReady(true)
    if (video.readyState >= 2) ready()
    video.addEventListener('loadeddata', ready)
    video.addEventListener('canplay', ready)

    return () => {
      window.removeEventListener('load', attach)
      video.removeEventListener('loadeddata', ready)
      video.removeEventListener('canplay', ready)
    }
  }, [reduced])

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
    <section ref={sectionRef} className="scrub-section relative h-[400vh]">
      <div className="scrub-stage sticky top-0 h-[100svh] overflow-hidden bg-bg">
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
        <div className="scrub-stage-media absolute inset-0">
          <div className="scrub-frame">
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
              width={1280}
              height={720}
              alt={POSTER_ALT}
              fetchPriority="high"
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
              style={{ opacity: !reduced && loopReady ? 1 : 0 }}
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
                Подмена мгновенная, без растворения, и это выяснено дорого.
                Петля и промотка выросли из разных кадров: технику в опорном
                кадре нейросеть перерисовала, и в зоне аппарелей расходится 71%
                пикселей. При растворении за 220 мс машина на глазах перетекает
                из одной формы в другую — заметно именно это, а не дождь. Резкая
                подмена меняет её за один кадр, в момент, когда человек уже
                двигает страницу, и движение это прикрывает.
              */
              style={{ opacity: videoReady && !atStart ? 1 : 0 }}
            />

            {/*
              Кромки растворяются в фоне страницы. Работает это потому, что --bg
              замерен по краям видеокадра: заливка и картинка на стыке почти
              одного тона, и границы кадра не видно. Затемняется только пустая
              периферия, техника остаётся нетронутой.
            */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-[var(--fade-l)]"
              style={{ background: 'linear-gradient(to right, var(--color-bg) 0%, rgb(11 7 15 / 0) 100%)' }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-[var(--fade-r)]"
              style={{ background: 'linear-gradient(to left, var(--color-bg) 0%, rgb(11 7 15 / 0) 100%)' }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[var(--fade-y)]"
              style={{ background: 'linear-gradient(to bottom, var(--color-bg) 0%, rgb(11 7 15 / 0) 100%)' }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[var(--fade-y)]"
              style={{ background: 'linear-gradient(to top, var(--color-bg) 0%, rgb(11 7 15 / 0) 100%)' }}
            />
          </div>
        </div>

        <PhaseRail progress={scrollYProgress} />

        {/*
          Одно текстовое поле на всю секцию: сначала первый экран, затем на его
          месте подписи. Поле лежит левее кадра на чистом --bg, поэтому текст
          ничем не затемняется и не спорит с картинкой.
        */}
        <div className="scrub-copy">
          <HeroCopy progress={scrollYProgress} />
          {CAPTIONS.map((c) => (
            <ScrubCaption
              key={c.title}
              progress={scrollYProgress}
              from={c.from}
              to={c.to}
              title={c.title}
              text={c.text}
            />
          ))}
        </div>

        <div className="scrub-hud pointer-events-none font-mono text-hud tracking-[0.14em] text-amber tabular-nums">
          ФАЗА: {phase} · ПРОКРУТКА: {String(percent).padStart(2, '0')}%
        </div>
      </div>
    </section>
  )
}
