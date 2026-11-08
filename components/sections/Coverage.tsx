'use client'

import { useMemo, useState, type CSSProperties } from 'react'

import { COVERAGE_HEAD } from '@/lib/content'
import { PHONE_DISPLAY, PHONE_HREF } from '@/lib/config'
import { MAP, project } from '@/lib/mapShapes'
import { DIRS, MAP_CITIES, MORE_PLACES, OUTSIDE, SPB, SPB_NAMES, norm } from '@/lib/places'
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
 */

const AT = (lon: number, lat: number) => {
  const [x, y] = project(lon, lat)
  return { x, y, left: `${((x / MAP.w) * 100).toFixed(2)}%`, top: `${((y / MAP.h) * 100).toFixed(2)}%` }
}
const SPB_AT = AT(SPB.lon, SPB.lat)

const CITIES = MAP_CITIES.map((c) => {
  const p = AT(c.lon, c.lat)
  const dist = Math.hypot(p.x - SPB_AT.x, p.y - SPB_AT.y)
  return { ...c, ...p, delay: Math.round(300 + dist * 2.2) }
})

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

export function Coverage() {
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const res = useMemo(() => answer(query), [query])
  const lit = hover ?? (res.kind === 'yes' ? res.place : null)

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

        <figure className="cov-map reveal">
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
          </svg>

          <span className="cov-water" style={pos(28.75, 60.06)} aria-hidden="true">
            Финский залив
          </span>
          <span className="cov-water" style={pos(31.3, 60.9)} aria-hidden="true">
            Ладожское
            <br />
            озеро
          </span>

          <span className="cov-hub" style={{ left: SPB_AT.left, top: SPB_AT.top }} aria-hidden="true">
            <span className="cov-hub__dot" />
            <span className="cov-hub__label">Петербург</span>
          </span>

          {CITIES.map((c) => (
            <span
              key={c.name}
              aria-hidden="true"
              className={`cov-city${c.big ? ' cov-city--big' : ''}${c.left ? ' cov-city--left' : ''}${lit === c.name ? ' is-lit' : ''}`}
              style={{ left: c.left, top: c.top, '--d': `${c.delay}ms` } as CSSProperties}
              onPointerEnter={() => setHover(c.name)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="cov-city__dot" />
              <span className="cov-city__label">{c.name}</span>
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
                <li key={c.name}>{c.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="coverage-note">И&nbsp;любой другой адрес в&nbsp;Ленинградской области.</p>
    </section>
  )
}
