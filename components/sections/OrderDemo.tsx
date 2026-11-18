'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react'

import { ORDER_HEAD, ORDER_STEPS } from '@/lib/content'
import { SectionHead } from '@/components/ui/SectionHead'
import { BotButton, CallButton } from '@/components/ui/ActionButtons'
import { IPhone } from '@/components/phone/IPhone'
import { BEATS, playAt, playAtExact, STAGE_TIME, TgDemo, type ScenePos } from '@/components/phone/TgDemo'
import { onHeroLoopDoneIfFast } from '@/lib/heroLoopDone'
import { useSmoothProgress } from '@/lib/useSmoothProgress'

/**
 * Заказ в боте: этапы слева, iPhone справа.
 *
 * Блок залипает на экране, как глава «Грузим», и ведётся прокруткой так же:
 * всё, что происходит на iPhone, лежит на одной шкале (этапы друг за другом,
 * шаги — DUR в TgDemo), прокрутка задаёт место на шкале, а показ догоняет его
 * тем же плавным ходом, что клип «Грузим» (lib/useSmoothProgress: щелчок
 * колеса раскатывается ~0,7 с с мягким торможением). Своего проигрыша нет:
 * остановили прокрутку — через долю секунды всё стоит; прокрутили назад —
 * идёт назад; быстро ушли вниз — ничего не доигрывается за спиной.
 *
 * История (владелец, 15 ноября 2026): «прокрутка тяжёлая, печать слишком
 * быстрая» (шаги за прокруткой, но форма из 12 шагов сжата в длину одного
 * этапа — ~70 px на шаг); «всё как видео, а не скроллингом, можно случайно
 * проскролить до 3-го пункта — всё промотается» (шаги по таймеру); «прокрутка
 * слишком быстрая и не останавливается, страница ушла, а анимации ещё идут
 * ускоренно — сделай, как в «Грузим»» (догоняние в живом темпе).
 *
 * Как листает клиент (разбор 15 ноября 2026). ~80% — телефон: бросок
 * пальцем проходит 0,6–1,2 экрана за ~1 с, между бросками 1–3 с чтения.
 * Компьютер: колесо щелчками по 100 px, пачками по 3–5; трекпад — как палец.
 * Касание на экране iPhone понятно, если видно ≥0,4 с, печать имени — ~1 с.
 * При чистой прокрутке бросок пальцем = 4–7 действий за секунду (в 5–10 раз
 * быстрее живого) — «всё пролетит»; а чтобы обычный темп давал живой, дорожка
 * нужна 14+ экранов — «тяжело». Поэтому так:
 *  — длина прокрутки каждого шага — по его весу (живой темп без пауз
 *    автопроигрыша): щелчок колеса ≈ одно маленькое действие, форма длинная,
 *    «Едем к вам» короткий; после каждого этапа короткая остановка;
 *  — показ разбит на 16 долей — законченных действий (BEATS в TgDemo:
 *    «форма открылась», «имя и телефон», «точка на карте»…). Пока листают —
 *    всё идёт за прокруткой, как в «Грузим». Перестали листать посреди доли —
 *    страница сама плавно докручивает её до конца (0,3–2 с, в живом темпе)
 *    и встаёт; листали вверх — возвращает к началу доли. Так любой жест —
 *    щелчок, бросок, PageDown — заканчивается законченным действием, а не
 *    полупечатанным именем, и темп действий живой при любой скорости
 *    листания. Любое касание, колесо, клавиша сразу останавливают доводку.
 *    Залипший экран при этом стоит — видно только, как телефон доделывает
 *    шаг. Вне блока (до первой доли и после последней) ничего не доводится,
 *    при «меньше движения» — тоже.
 * На компьютере пункт 1 стоит сразу под заголовком, а кнопки заказа — сразу
 * под пунктом 5 (владелец: «большой разрыв между заголовком и первым пунктом,
 * так же между 5 пунктом и кнопками»): список едет, только пока не помещается,
 * и останавливается у краёв. На телефоне посетителя два столбца не помещаются:
 * экран — подпись текущего этапа с полоской хода и iPhone; список остаётся
 * для экранного чтеца.
 *
 * Пунктир между номерами — SVG с шагом, подогнанным под длину отрезка:
 * штрихи начинаются и кончаются ровно у кружков, зазоры одинаковые.
 */

const N = ORDER_STEPS.length

/** Начало каждого этапа на общей шкале, с. */
const STAGE_AT = STAGE_TIME.map((_, i) => STAGE_TIME.slice(0, i).reduce((a, b) => a + b, 0))

/*
 * Дорожка прокрутки, в высотах окна. LEAD — блок уже залип, на экране пустой
 * чат; PER_SEC — прокрутки на единицу веса шагов (0,12 высоты ≈ 110 px на
 * экране 900 px: щелчок колеса — ~0,9 единицы); HOLD — остановка после
 * этапа (кроме последнего); TAIL — запас на сглаживание, ~45 px: после 5-го
 * шага блок сразу уезжает (замечание владельца — раньше ещё ~0,4 высоты окна
 * листалось вхолостую). Всего ≈ 4 высоты окна (у «Грузим» — 3 на клип).
 */
const LEAD = 0.15
const PER_SEC = 0.12
const HOLD = 0.12
const TAIL = 0.05
const SPAN = STAGE_TIME.map((t) => t * PER_SEC + HOLD)
const SPAN_AT = SPAN.map((_, i) => LEAD + SPAN.slice(0, i).reduce((a, b) => a + b, 0))
/** Вся дорожка, в высотах окна (--units для CSS): конец — сразу за последним действием. */
const UNITS = SPAN_AT[N - 1] + STAGE_TIME[N - 1] * PER_SEC + TAIL

/** Место на шкале по прокрутке: u — пройдено высот окна от начала дорожки. */
function timeAt(u: number) {
  for (let s = N - 1; s >= 0; s--) {
    if (u >= SPAN_AT[s]) {
      const play = STAGE_TIME[s] * PER_SEC
      return STAGE_AT[s] + STAGE_TIME[s] * Math.min(1, (u - SPAN_AT[s]) / play)
    }
  }
  return 0
}

/** Этап и время внутри него. Ровно на стыке — предыдущий этап, доигранный. */
function stageOf(g: number) {
  let s = 0
  while (s < N - 1 && g > STAGE_AT[s + 1] + 1e-6) s++
  return { s, local: Math.min(STAGE_TIME[s], Math.max(0, g - STAGE_AT[s])) }
}

/**
 * Места остановки, в высотах окна от начала дорожки: начало показа и конец
 * каждой доли. Внутри этапа — на волосок (0,015 веса) раньше стыка: ровно на
 * стыке уже начинается следующий шаг (палец на поле имени, приветствие),
 * а остановка должна показывать законченное действие.
 */
const RESTS = [
  SPAN_AT[0],
  ...BEATS.flatMap((ends, s) =>
    ends.map((w) => SPAN_AT[s] + (w < STAGE_TIME[s] - 1e-6 ? w - 0.015 : w) * PER_SEC),
  ),
]

/** Доводка доли: секунд на единицу веса (живой темп) и пределы длительности. */
const SNAP_PER_UNIT = 0.65
const SNAP_MIN = 0.3
const SNAP_MAX = 2
/** Тишина после последнего события прокрутки — жест кончился, вместе с инерцией. */
const IDLE_MS = 160

/** Ширина растворения краёв списка, px: появляется, когда за краем что-то есть. */
const FADE_PX = 80

export function OrderDemo() {
  const [lit, setLit] = useState(-1)
  const [pos, setPos] = useState<ScenePos>({ s: 0, t: 0, sub: 0 })
  const [near, setNear] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const geo = useRef({ tops: [] as number[], viewH: 0, listH: 0, desktop: false })
  /** Точное место на шкале каждый кадр — для плавного (карта), без перерисовки. */
  const exact = useRef<ScenePos>({ s: 0, t: 0, sub: 0 })
  /** Пройденная доля дорожки: как есть и сглаженная, как в «Грузим». */
  const raw = useMotionValue(0)
  const reducedMotion = useReducedMotion()
  const smooth = useSmoothProgress(raw, !reducedMotion)
  const reduced = reducedMotion

  /*
   * Экран бота и его шрифты (Inter и Oswald, ~100 КБ) включаются, когда блок в полутора
   * экранах от окна и уже заиграла петля первого экрана (lib/heroLoopDone; на слабой связи
   * этого раннего старта нет — только подход к блоку) — по той же
   * очереди, что и клип главы «Грузим». Посетитель уже у блока — ждать петлю незачем
   * (вторая граница, четверть экрана).
   */
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    let close = false
    let loopDone = false
    let dropLoop = () => {}
    const go = () => {
      setNear(true)
      far.disconnect()
      at.disconnect()
      dropLoop()
    }
    const far = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) close = true
        if (close && loopDone) go()
      },
      { rootMargin: '150% 0px' },
    )
    const at = new IntersectionObserver(([e]) => e.isIntersecting && go(), {
      rootMargin: '25% 0px',
    })
    far.observe(el)
    at.observe(el)
    dropLoop = onHeroLoopDoneIfFast(() => {
      loopDone = true
      if (close) go()
    })
    return () => {
      far.disconnect()
      at.disconnect()
      dropLoop()
    }
  }, [])

  // Прокрутка → доля дорожки (raw); сглаживание и показ — ниже, от smooth.
  useEffect(() => {
    const track = trackRef.current
    const list = listRef.current
    const view = viewRef.current
    if (!track || !list || !view) return
    let top = 0
    let len = 1
    let raf = 0

    const measure = () => {
      const r = track.getBoundingClientRect()
      top = r.top + scrollY
      len = Math.max(1, track.offsetHeight - innerHeight)
      // Окно с запасом под свечение кружков (padding) — считаем по содержимому.
      const cs = getComputedStyle(view)
      const inner = view.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      geo.current.tops = [...list.querySelectorAll<HTMLElement>('.order-step')].map((el) => el.offsetTop - list.offsetTop)
      geo.current.viewH = inner
      geo.current.listH = list.offsetHeight
      geo.current.desktop = getComputedStyle(view).position !== 'absolute'
    }
    const read = () => {
      raf = 0
      raw.set(Math.min(1, Math.max(0, (scrollY - top) / len)))
    }

    /*
     * Доводка доли. Ждём конца жеста (тишина IDLE_MS после последнего события
     * прокрутки — инерция броска тоже шлёт события; пока палец на экране — не
     * трогаем), находим долю, в которой
     * остановились, и плавно докручиваем страницу до её конца (листали вниз)
     * или начала (вверх). События своей прокрутки жестом не считаются; если
     * позиция ушла от ожидаемой — человек вмешался, доводку бросаем.
     */
    let touching = false
    let dir = 1
    let lastY = scrollY
    let idle = 0
    let snap = 0
    let expect = -1
    const stopSnap = () => {
      if (snap) cancelAnimationFrame(snap)
      snap = 0
      expect = -1
    }
    const trySnap = () => {
      idle = 0
      if (reduced || touching || snap) return
      const u = ((scrollY - top) / len) * UNITS
      const last = RESTS.length - 1
      if (u <= RESTS[0] + 1e-3 || u >= RESTS[last] - 1e-3) return
      let k = 0
      while (k < last - 1 && u >= RESTS[k + 1]) k++
      // Уже на месте остановки (с точностью до пары пикселей) — ничего не делать.
      const near = (2 / len) * UNITS
      if (u - RESTS[k] < near || RESTS[k + 1] - u < near) return
      // Листали вниз — доля доводится вперёд, вверх — назад. Без возврата «к
      // ближнему краю»: он тянул назад после маленькой прокрутки — начало
      // следующего действия мелькало и пропадало, а мелкими щелчками (трекпад,
      // стрелки, мышь с шагом 30–50 px) нельзя было сдвинуться с места.
      const to = dir > 0 ? RESTS[k + 1] : RESTS[k]
      const y0 = scrollY
      const y1 = top + (to / UNITS) * len
      if (Math.abs(y1 - y0) < 2) return
      const ms = 1000 * Math.min(SNAP_MAX, Math.max(SNAP_MIN, Math.abs(timeAt(to) - timeAt(u)) * SNAP_PER_UNIT))
      const t0 = performance.now()
      const step = (now: number) => {
        const q = Math.min(1, (now - t0) / ms)
        // Плавный разгон и торможение: жест кончился с нулевой скоростью.
        const e = 0.5 - 0.5 * Math.cos(Math.PI * q)
        const y = y0 + (y1 - y0) * e
        expect = y
        // Простая форма вызова: мгновенно (плавной прокрутки в CSS у сайта нет) и без
        // параметра behavior: 'instant', который старый Safari не понимает.
        window.scrollTo(0, y)
        snap = q < 1 ? requestAnimationFrame(step) : 0
      }
      snap = requestAnimationFrame(step)
    }
    const settle = () => {
      if (idle) clearTimeout(idle)
      idle = window.setTimeout(trySnap, IDLE_MS)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read)
      const y = scrollY
      if (expect >= 0) {
        // Своя доводка; заметно ушли от ожидаемого — вмешался человек.
        if (Math.abs(y - expect) > 4) {
          stopSnap()
          if (!touching) settle()
        } else if (!snap) {
          expect = -1
        }
      } else {
        if (Math.abs(y - lastY) > 0.5) dir = y > lastY ? 1 : -1
        if (!touching) settle()
      }
      lastY = y
    }
    const onTouchStart = () => {
      touching = true
      stopSnap()
      if (idle) clearTimeout(idle)
    }
    const onTouchEnd = () => {
      touching = false
      settle()
    }
    const onInput = () => stopSnap()
    const onResize = () => {
      measure()
      read()
      show(smooth.get())
    }
    measure()
    read()
    show(smooth.get())
    const ro = new ResizeObserver(onResize)
    ro.observe(track)
    ro.observe(list)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    window.addEventListener('wheel', onInput, { passive: true })
    window.addEventListener('keydown', onInput)
    window.addEventListener('mousedown', onInput)
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      stopSnap()
      if (idle) clearTimeout(idle)
      ro.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('wheel', onInput)
      window.removeEventListener('keydown', onInput)
      window.removeEventListener('mousedown', onInput)
      window.removeEventListener('resize', onResize)
    }
    // show читает только ref-ы и сеттеры — пересоздавать подписку незачем
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, smooth, reduced])

  /** Сглаженная доля дорожки → место на шкале. «Меньше движения»: этап сразу доигранным. */
  function show(v: number) {
    let g = timeAt(v * UNITS)
    if (reduced && g > 0) {
      const { s } = stageOf(g)
      g = STAGE_AT[s] + STAGE_TIME[s]
    }
    render(g, v * UNITS)
  }
  useMotionValueEvent(smooth, 'change', show)

  /**
   * Показать место шкалы g (u — пройдено высот окна): телефон, номер этапа,
   * пунктир, список, полоска хода.
   */
  function render(g: number, u: number) {
    const { s, local } = stageOf(g)
    exact.current = playAtExact(s, local)
    const next = playAt(s, local)
    setPos((p) => (p.s === next.s && p.t === next.t && p.sub === next.sub ? p : next))
    const l = g <= 0 ? -1 : s
    setLit((p) => (p === l ? p : l))
    // Пройдено этапов, дробно: 2.5 — середина третьего.
    const r = g <= 0 ? 0 : s + local / STAGE_TIME[s]
    if (barRef.current) barRef.current.style.transform = `scaleX(${(g <= 0 ? 0 : local / STAGE_TIME[s]).toFixed(3)})`

    const list = listRef.current
    const view = viewRef.current
    if (!list || !view) return
    // Пунктир между кружками i и i+1 налит на долю пути между ними.
    list.querySelectorAll<HTMLElement>('.order-dashes').forEach((el, i) => {
      el.style.setProperty('--fill', Math.min(1, Math.max(0, r - i)).toFixed(4))
    })
    /*
     * Список едет плавно всё время, пока листают (владелец: «у 3-го пункта
     * левая часть резко перескакивает, у 4-го и 5-го ещё резче» — переезд был
     * в первую четверть этапа, а этапы 3–5 короткие, это 50–100 px прокрутки).
     * Опорные точки — начало каждого этапа: его пункт на линии чтения; между
     * ними — плавный ход по прокрутке (быстрее там, где этап короче, но всегда
     * через всю его длину). Линия чтения — не выше расстояния между пунктами:
     * пока этап идёт, его пункт поднимается от линии вверх ровно на одно
     * расстояние и к концу этапа ещё целиком в окне, а следующий выплывает
     * снизу. Не дальше краёв: пункт 1 — у верха окна, пункт 5 — у кнопок.
     */
    const { tops, viewH, listH, desktop } = geo.current
    if (desktop && tops.length === N) {
      const gap = tops[1] - tops[0]
      const line = Math.min(viewH - 180, Math.max(viewH * 0.5, gap + 28))
      const min = Math.min(0, viewH - listH)
      const yOf = (i: number) => Math.min(0, Math.max(min, line - tops[i]))
      const pts: [number, number][] = SPAN_AT.map((a, i) => [a, yOf(i)])
      pts.push([SPAN_AT[N - 1] + STAGE_TIME[N - 1] * PER_SEC, min])
      let y = pts[0][1]
      if (u >= pts[pts.length - 1][0]) y = pts[pts.length - 1][1]
      else {
        for (let k = 0; k < pts.length - 1; k++) {
          if (u >= pts[k][0] && u < pts[k + 1][0]) {
            const f = (u - pts[k][0]) / (pts[k + 1][0] - pts[k][0])
            y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f * f * (3 - 2 * f)
            break
          }
        }
      }
      const dpr = window.devicePixelRatio || 1
      list.style.transform = `translate3d(0, ${(Math.round(y * dpr) / dpr).toFixed(2)}px, 0)`
      view.style.setProperty('--ft', Math.min(1, -y / FADE_PX).toFixed(3))
      view.style.setProperty('--fb', Math.min(1, (y - min) / FADE_PX).toFixed(3))
    }
  }

  const scene = pos.s
  const cap = ORDER_STEPS[scene]

  return (
    <section
      ref={sectionRef}
      id="steps"
      aria-labelledby="steps-title"
      className={`section shell order${near ? ' is-near' : ''}`}
    >
      <SectionHead id="steps-title" {...ORDER_HEAD} />

      <div ref={trackRef} className="order-track" style={{ '--units': UNITS.toFixed(3) } as CSSProperties}>
        <div className="order-pin">
          <div className="order-wrap">
            <div className="order-stage">
              <div className="order-cap" aria-hidden="true">
                <span className="order-cap__no">
                  {scene + 1}
                  <span>/{N}</span>
                </span>
                <span key={scene} className="order-cap__body">
                  <b>{cap.title}</b>
                  <span>{cap.text}</span>
                </span>
                {/* Ход этапа: полоска растёт вместе с действиями на экране iPhone. */}
                <span ref={barRef} className="order-cap__bar" />
              </div>
              <figure className="order-phone">
                {/*
                  Экран бота собирается, только когда блок близко (near, см. выше).
                  Иначе телефон посетителя раскладывал его до первой отрисовки страницы, хотя
                  блок на несколько экранов ниже: замер 14 ноября 2026 (Chrome, телефон с
                  процессором ×4) — первый экран 1,04 → 0,62 с. Рамка iPhone остаётся на месте,
                  поэтому высота страницы не меняется.
                */}
                <IPhone>{near && <TgDemo scene={scene} tick={pos.t} sub={pos.sub} exact={exact} />}</IPhone>
                <figcaption className="sr-only">
                  Заказ эвакуатора в Telegram-боте на экране iPhone: первый вход, форма заявки и статусы.
                </figcaption>
              </figure>
            </div>

            <div className="order-side">
              <div ref={viewRef} className="order-view">
                <ol ref={listRef} className="order-steps">
                  {ORDER_STEPS.map((s, i) => (
                    <li key={s.title} className={`order-step${i <= lit ? ' is-lit' : ''}${i === lit ? ' is-now' : ''}`}>
                      <span className="order-node" aria-hidden="true">
                        {i + 1}
                      </span>
                      {i < N - 1 && <Dashes />}
                      <div className="order-step__body">
                        {s.status && (
                          <p className="route-status">
                            <span className="sr-only">Статус в боте: </span>
                            {s.status}
                          </p>
                        )}
                        <h3>{s.title}</h3>
                        <p className="order-step__text">{s.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              {/* Компьютер: кнопки сразу под списком, на том же залипшем экране. */}
              <div className="order-cta order-cta--pin">
                <BotButton />
                <CallButton withNumber />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Телефон и планшет: кнопки после блока (на залипшем экране им нет места). */}
      <div className="order-cta order-cta--after">
        <BotButton />
        <CallButton withNumber />
      </div>
    </section>
  )
}

/** Штрих и желаемый зазор, px. Зазор подгоняется под длину отрезка. */
const DASH = 12
const GAP = 10

function Dashes() {
  const ref = useRef<HTMLSpanElement>(null)
  const [len, setLen] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLen(Math.round(e.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // n штрихов и n−1 зазоров ровно на всю длину: первый штрих у верхнего
  // кружка, последний — у нижнего.
  const n = Math.max(1, Math.round((len + GAP) / (DASH + GAP)))
  const gap = n > 1 ? (len - n * DASH) / (n - 1) : 0
  const dash = `${DASH} ${gap.toFixed(2)}`

  return (
    <span ref={ref} className="order-dashes" aria-hidden="true">
      {len > 0 && (
        <>
          <svg width="2" height={len} viewBox={`0 0 2 ${len}`}>
            <line x1="1" y1="0" x2="1" y2={len} className="order-dashes__base" strokeDasharray={dash} />
          </svg>
          {/* Янтарная копия сверху наливается вниз вместе с прокруткой (--fill ставит OrderDemo). */}
          <span className="order-dashes__fill">
            <svg width="2" height={len} viewBox={`0 0 2 ${len}`}>
              <line x1="1" y1="0" x2="1" y2={len} className="order-dashes__lit" strokeDasharray={dash} />
            </svg>
          </span>
        </>
      )}
    </span>
  )
}
