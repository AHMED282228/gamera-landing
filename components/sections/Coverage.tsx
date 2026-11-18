'use client'

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { COVERAGE_HEAD } from '@/lib/content'
import { PHONE_DISPLAY, PHONE_HREF } from '@/lib/config'
import { MAP, project } from '@/lib/mapShapes'
import { DIRS, MAP_CITIES, MORE_PLACES, OUTSIDE, SPB, SPB_NAMES, norm } from '@/lib/places'
import { ROUTES } from '@/lib/routes'
import { SectionHead } from '@/components/ui/SectionHead'
import { BotButton } from '@/components/ui/ActionButtons'

/**
 * Зона выезда: карта Петербурга и области вместо сплошного списка городов
 * (замечание владельца: список выглядел криво). Ни у одного из сильных
 * конкурентов в СПб карты нет — только списки.
 *
 * - Свет от Петербурга расходится по области, огоньки городов загораются
 *   по удалённости (CSS, задержка — от расстояния).
 * - Поле «Где стоит машина?» ищет по своему списку (lib/places.ts), без
 *   внешних сервисов. Нашли — «Да, приезжаем» и кнопка в бота. Не нашли —
 *   не «нет», а «укажите точку в боте»: место могло не попасть в список.
 * - Под картой те же города колонками по направлениям — для глаз и поиска.
 * - Найденный (или наведённый) город соединяется с Петербургом линией по
 *   настоящим дорогам (lib/routes.ts, OSRM) — «отсюда выедем туда», с длиной
 *   пути в км. Раньше была дуга напрямик и ложилась на соседние огоньки
 *   (владелец, 15 ноября 2026); теперь города по пути — честно «по дороге»,
 *   огоньки в тёмном ободке видны поверх линии, остальные приглушаются.
 * - Подписи раскладываются сами (placeLabels): у каждой точки пробуются места
 *   вокруг, берётся первое свободное — подписан каждый город, где есть место
 *   (владелец: «у точек со свободным местом нет подписей»). Не влезла —
 *   подпись появляется при наведении.
 * - Подпись «Петербург» вынесена выноской на север, в пустое место перешейка:
 *   справа от точки на ней лежали огоньки Мурино и Кудрово (замечание
 *   владельца 15 ноября 2026).
 */

const AT = (lon: number, lat: number) => {
  const [x, y] = project(lon, lat)
  return { x, y, left: `${((x / MAP.w) * 100).toFixed(2)}%`, top: `${((y / MAP.h) * 100).toFixed(2)}%` }
}
const SPB_AT = AT(SPB.lon, SPB.lat)
/** Низ подписи «Петербург» — над точкой города, на Карельском перешейке. */
const SPB_LABEL_AT = AT(30.25, 60.4)

/*
 * Свойства точки на карте (x, y, left, top в процентах) кладутся поверх
 * свойств города. Флаг «подпись слева» поэтому хранится отдельно (side):
 * раньше его затирал процент left из AT, и все подписи стояли слева —
 * на телефоне «Выборг» и «Кингисепп» уходили за край карты.
 */
const CITIES = MAP_CITIES.map((c) => {
  const p = AT(c.lon, c.lat)
  const dist = Math.hypot(p.x - SPB_AT.x, p.y - SPB_AT.y)
  return { ...c, ...p, side: c.left ? 'left' : 'right', delay: Math.round(300 + dist * 2.2) }
})

/** Запасной путь, если маршрута по дорогам нет: дуга с изгибом в сторону. */
function arc(x: number, y: number) {
  const dx = x - SPB_AT.x
  const dy = y - SPB_AT.y
  const bend = 0.22
  const cx = SPB_AT.x + dx / 2 - dy * bend
  const cy = SPB_AT.y + dy / 2 + dx * bend
  return `M${SPB_AT.x.toFixed(1)} ${SPB_AT.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
}

/*
 * Места переноса для длинных названий в колонках (мягкий перенос, U+00AD).
 * У Chrome и WebKit на Windows нет русского словаря переносов: без этого
 * «Шлиссельбург» и «Бокситогорск» на узкой колонке вылезали за край.
 * По слогам вручную — перенос одинаковый во всех браузерах. Карта, поиск
 * и разметка для поисковиков берут названия без них.
 */
const SPLIT: Record<string, string> = {
  Сестрорецк: 'Сест·ро·рецк',
  Зеленогорск: 'Зе·ле·но·горск',
  Всеволожск: 'Все·во·ложск',
  Шлиссельбург: 'Шлис·сель·бург',
  Подпорожье: 'Под·по·ро·жье',
  Бокситогорск: 'Бок·си·то·горск',
}
const hyph = (name: string) => (SPLIT[name] ?? name).split('·').join('­')

const ALL_NAMES = [...new Set([...MAP_CITIES.map((c) => c.name), ...MORE_PLACES])]
const INDEX = ALL_NAMES.map((name) => ({ name, key: norm(name) }))
const OUT = OUTSIDE.map((name) => ({ name, key: norm(name) }))

type Answer =
  | { kind: 'idle' }
  | { kind: 'yes'; place: string }
  | { kind: 'out'; place: string }
  | { kind: 'maybe' }

function answer(input: string): Answer {
  const raw = input.toLowerCase().replace(/ё/g, 'е').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  if (raw.length < 2) return { kind: 'idle' }
  if (SPB_NAMES.some((n) => raw.startsWith(n) || (raw.length >= 3 && n.startsWith(raw)))) {
    return { kind: 'yes', place: SPB.name }
  }
  const q = norm(input)
  if (q.length < 2) return { kind: 'idle' }
  const hit = (k: string) => k.startsWith(q) || k.includes(' ' + q) || (q.length > k.length && q.startsWith(k + ' '))
  const out = OUT.find((o) => hit(o.key))
  if (out) return { kind: 'out', place: out.name }
  const found = INDEX.find((p) => hit(p.key))
  if (found) return { kind: 'yes', place: found.name }
  return q.length >= 3 ? { kind: 'maybe' } : { kind: 'idle' }
}

function pos(lon: number, lat: number): CSSProperties {
  const p = AT(lon, lat)
  return { left: p.left, top: p.top }
}

type Box = { x: number; y: number; w: number; h: number; dot?: { x: number; y: number } }
const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Места для подписи вокруг точки, по порядку предпочтения: справа, слева,
 * сверху, снизу, по диагоналям. l/r — от какого края подпись отмеряется
 * (у подписи слева правый край стоит на месте, и бирка «· N км» при
 * наведении растёт влево, не наезжая на точку); c — по центру над/под точкой.
 */
const SPOTS = [
  { a: 'l', dx: 9, dy: (h: number) => -h / 2 },
  { a: 'r', dx: 9, dy: (h: number) => -h / 2 },
  { a: 'c', dx: 0, dy: (h: number) => -h - 6 },
  { a: 'c', dx: 0, dy: () => 6 },
  { a: 'l', dx: 5, dy: (h: number) => -h - 2 },
  { a: 'l', dx: 5, dy: () => 2 },
  { a: 'r', dx: 5, dy: (h: number) => -h - 2 },
  { a: 'r', dx: 5, dy: () => 2 },
] as const

/**
 * Раскладка подписей городов без наложений: крупные города первыми, районы
 * Петербурга последними. Препятствия — все огоньки, подписи «Петербург» и
 * вод, выноска, уже поставленные подписи и край карты. Считается в пикселях
 * на текущей ширине (на телефоне подписей влезает меньше) и заново при
 * изменении размера.
 */
function placeLabels(fig: HTMLElement) {
  const W = fig.clientWidth
  const H = fig.clientHeight
  if (!W || !H) return
  const base = fig.getBoundingClientRect()
  const rectOf = (el: Element): Box => {
    const r = el.getBoundingClientRect()
    return { x: r.left - base.left - 3, y: r.top - base.top - 3, w: r.width + 6, h: r.height + 6 }
  }
  const cities = [...fig.querySelectorAll<HTMLElement>('.cov-city')]
  const at = (el: HTMLElement) => ({ x: (parseFloat(el.style.left) / 100) * W, y: (parseFloat(el.style.top) / 100) * H })
  const spot = new Map(cities.map((el) => [el, at(el)]))
  const dots = [...spot.values()]
  const boxes: Box[] = [
    ...dots.map((p) => ({ x: p.x - 7, y: p.y - 7, w: 14, h: 14, dot: p })),
    ...[...fig.querySelectorAll('.cov-hub__label, .cov-water, .cov-hub')].map((el) => {
      const b = rectOf(el)
      return el.classList.contains('cov-hub') ? { x: b.x - 10, y: b.y - 10, w: 26, h: 26 } : b
    }),
  ]
  const rank = (el: HTMLElement) =>
    el.classList.contains('cov-city--big') ? 0 : el.classList.contains('cov-city--inner') ? 2 : 1
  const order = cities.map((el, i) => ({ el, i })).sort((a, b) => rank(a.el) - rank(b.el) || a.i - b.i)
  for (const { el } of order) {
    const label = el.querySelector<HTMLElement>('.cov-city__label')
    if (!label) continue
    const w = label.offsetWidth
    const h = label.offsetHeight
    const p = spot.get(el)!
    // У кого в данных подпись слева (тесно справа) — сначала пробуем слева.
    const spots = el.classList.contains('cov-city--left') ? [SPOTS[1], SPOTS[0], ...SPOTS.slice(2)] : SPOTS
    const big = el.classList.contains('cov-city--big')
    let chosen: (typeof SPOTS)[number] | null = null
    let fallback: (typeof SPOTS)[number] | null = null
    /** Штраф места для запасного выбора: «читается как чужая» хуже наложения. */
    let fewest = Infinity
    for (const sp of spots) {
      const x = sp.a === 'l' ? p.x + sp.dx : sp.a === 'r' ? p.x - sp.dx - w : p.x - w / 2
      const box = { x, y: p.y + sp.dy(h), w, h }
      if (box.x < 2 || box.y < 2 || box.x + w > W - 2 || box.y + h > H - 2) continue
      // Подпись не должна читаться как чужая: другой огонёк ближе к её
      // середине, чем свой, — место не годится.
      const cx = box.x + w / 2
      const cy = box.y + h / 2
      const mine = Math.hypot(cx - p.x, cy - p.y)
      // И чужой огонёк вплотную к началу или концу подписи на её высоте: глаз
      // читает подпись справа от точки как её собственную.
      const other = dots.some(
        (d) =>
          d !== p &&
          (Math.hypot(cx - d.x, cy - d.y) < mine * 0.85 ||
            (d.y > box.y - 6 &&
              d.y < box.y + h + 6 &&
              ((d.x < box.x && box.x - d.x < 18) || (d.x > box.x + w && d.x - box.x - w < 18)))),
      )
      // Закрыть чужой огонёк — хуже всего, наложиться на подпись — меньшее зло.
      let clash = 0
      for (const b of boxes) if (b.dot !== p && hits(b, box)) clash += b.dot ? 30 : 5
      const cost = clash + (other ? 10 : 0)
      if (cost < fewest) {
        fewest = cost
        fallback = sp
      }
      if (clash || other) continue
      chosen = sp
      boxes.push({ x: box.x - 3, y: box.y - 1, w: w + 6, h: h + 2 })
      break
    }
    // Крупный город подписан всегда: нет свободного места — где меньше наложений;
    // его место тоже занято для следующих подписей.
    if (!chosen && big && fallback) {
      chosen = fallback
      const x = chosen.a === 'l' ? p.x + chosen.dx : chosen.a === 'r' ? p.x - chosen.dx - w : p.x - w / 2
      boxes.push({ x: x - 3, y: p.y + chosen.dy(h) - 1, w: w + 6, h: h + 2 })
    }
    const sp = chosen ?? fallback ?? SPOTS[0]
    const st = label.style
    st.top = `${sp.dy(h).toFixed(1)}px`
    st.left = sp.a === 'l' ? `${sp.dx}px` : sp.a === 'c' ? '0px' : 'auto'
    st.right = sp.a === 'r' ? `${sp.dx}px` : 'auto'
    st.translate = sp.a === 'c' ? '-50% 0' : 'none'
    // Атрибут, а не класс: класс .cov-city пересобирает React при наведении.
    if (chosen) el.dataset.placed = ''
    else delete el.dataset.placed
  }
}

export function Coverage() {
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const res = useMemo(() => answer(query), [query])
  const lit = hover ?? (res.kind === 'yes' ? res.place : null)
  const litCity = CITIES.find((c) => c.name === lit)
  const route = litCity ? ROUTES[litCity.name] : undefined
  const figRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const fig = figRef.current
    if (!fig) return
    const run = () => placeLabels(fig)
    run()
    // Шрифты подписей могли догрузиться позже — ширина подписей меняется.
    document.fonts?.ready.then(run).catch(() => {})
    const ro = new ResizeObserver(run)
    ro.observe(fig)
    return () => ro.disconnect()
  }, [])

  return (
    <section id="coverage" aria-labelledby="coverage-title" className="section shell">
      <div className="cov">
        <div className="cov__text">
          <SectionHead id="coverage-title" {...COVERAGE_HEAD} />

          <div className="cov-search">
            <label htmlFor="cov-q" className="cov-search__label">
              Где стоит машина?
            </label>
            <input
              id="cov-q"
              className="cov-search__input"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Город, посёлок или район"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="cov-search__res" role="status" aria-live="polite">
              {res.kind === 'yes' && (
                <>
                  <p>
                    <span className="cov-ok" aria-hidden="true" />
                    <b>Да, приезжаем:</b> {res.place}.
                    {ROUTES[res.place] && (
                      <> От центра Петербурга&nbsp;— около {ROUTES[res.place].km}&nbsp;км по&nbsp;дороге.</>
                    )}
                  </p>
                  <BotButton className="btn--sm" />
                </>
              )}
              {res.kind === 'out' && (
                <p>
                  {res.place}&nbsp;— это за&nbsp;областью. Выезжаем по&nbsp;договорённости:{' '}
                  <a href={PHONE_HREF} className="cov-link tnum">
                    {PHONE_DISPLAY}
                  </a>
                </p>
              )}
              {res.kind === 'maybe' && (
                <p>
                  Такого места нет в&nbsp;нашем списке. Если это Петербург или Ленобласть&nbsp;— приедем: точку можно
                  поставить на&nbsp;карте в&nbsp;боте.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* data-lit, а не класс: класс is-in ставит появление (reveal), React его не трогает. */}
        <figure ref={figRef} className="cov-map reveal" data-lit={litCity ? '' : undefined}>
          <svg viewBox={`0 0 ${MAP.w} ${MAP.h}`} className="cov-map__svg" aria-hidden="true">
            <defs>
              <radialGradient id="cov-light" cx={SPB_AT.x} cy={SPB_AT.y} r="640" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#f3e4c8" stopOpacity="0.17" />
                <stop offset="0.4" stopColor="#f3e4c8" stopOpacity="0.055" />
                <stop offset="1" stopColor="#f3e4c8" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path d={MAP.near} className="cov-near" />
            <path d={MAP.lo} className="cov-lo" />
            <path d={MAP.lo} fill="url(#cov-light)" className="cov-glow" />
            <path d={MAP.spb} className="cov-spb" />
            {/* Выноска к подписи «Петербург». */}
            <line
              className="cov-callout"
              x1={SPB_AT.x}
              y1={SPB_AT.y - 16}
              x2={SPB_LABEL_AT.x}
              y2={SPB_LABEL_AT.y + 6}
              pathLength={1}
            />
            {litCity && (
              <g
                key={litCity.name}
                className="cov-route"
                style={{ '--draw': `${Math.min(1200, 450 + (route?.km ?? 60) * 3)}ms` } as CSSProperties}
              >
                {/* Тёмная подложка — линия читается поверх контуров и подписи города. */}
                <path d={route?.d ?? arc(litCity.x, litCity.y)} className="cov-route__case" pathLength={1} />
                <path d={route?.d ?? arc(litCity.x, litCity.y)} className="cov-route__glow" pathLength={1} />
                <path d={route?.d ?? arc(litCity.x, litCity.y)} className="cov-route__line" pathLength={1} />
              </g>
            )}
          </svg>

          <span className="cov-water" style={pos(28.65, 60.12)} aria-hidden="true">
            Финский
            <br />
            залив
          </span>
          <span className="cov-water" style={pos(31.6, 60.55)} aria-hidden="true">
            Ладожское
            <br />
            озеро
          </span>

          <span className="cov-hub" style={{ left: SPB_AT.left, top: SPB_AT.top }} aria-hidden="true">
            <span className="cov-hub__dot" />
          </span>
          <span
            className={`cov-hub__label${lit === SPB.name ? ' is-lit' : ''}`}
            style={{ left: SPB_LABEL_AT.left, top: SPB_LABEL_AT.top }}
            aria-hidden="true"
          >
            Петербург
          </span>

          {CITIES.map((c) => (
            <span
              key={c.name}
              aria-hidden="true"
              className={`cov-city${c.big ? ' cov-city--big' : ''}${c.inner ? ' cov-city--inner' : ''}${c.side === 'left' ? ' cov-city--left' : ''}${c.belowOnPhone ? ' cov-city--m-below' : ''}${lit === c.name ? ' is-lit' : ''}`}
              style={{ left: c.left, top: c.top, '--d': `${c.delay}ms` } as CSSProperties}
              onPointerEnter={() => setHover(c.name)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="cov-city__dot" />
              <span className="cov-city__label">
                {c.name}
                {ROUTES[c.name] && <span className="cov-city__km"> · {ROUTES[c.name].km}&nbsp;км</span>}
              </span>
            </span>
          ))}
          <figcaption className="sr-only">
            Карта Санкт-Петербурга и Ленинградской области с городами, куда выезжает эвакуатор.
          </figcaption>
        </figure>
      </div>

      <div className="cov-cols reveal">
        {DIRS.map((d) => (
          <div key={d.id} className="cov-col">
            <h3>{d.title}</h3>
            <ul>
              {MAP_CITIES.filter((c) => c.dir === d.id).map((c) => (
                <li key={c.name}>{hyph(c.name)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="coverage-note">И&nbsp;любой другой адрес в&nbsp;Ленинградской области.</p>
    </section>
  )
}
