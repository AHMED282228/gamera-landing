'use client'

import { useEffect, useRef, useState } from 'react'

export type Chapter = { label: string; ids: string[] }

/**
 * Полоса глав сверху: пять шагов одного вызова. Горит глава, в которой сейчас
 * середина экрана, под ней тянется заполнение. На первом экране и после
 * последней главы полоса прячется — там свои кнопки.
 */
export function ChapterBar({ chapters }: { chapters: Chapter[] }) {
  const [active, setActive] = useState(-1)
  const fills = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = 0
      const mid = innerHeight / 2
      let now = -1
      chapters.forEach((c, i) => {
        const els = c.ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
        if (!els.length) return
        const top = els[0].getBoundingClientRect().top
        const bottom = els[els.length - 1].getBoundingClientRect().bottom
        const k = Math.min(1, Math.max(0, (mid - top) / Math.max(1, bottom - top)))
        const fill = fills.current[i]
        if (fill) fill.style.transform = `scaleX(${k})`
        if (top <= mid && bottom > mid) now = i
      })
      setActive(now)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    on()
    addEventListener('scroll', on, { passive: true })
    addEventListener('resize', on)
    return () => {
      removeEventListener('scroll', on)
      removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [chapters])

  return (
    <nav className="chapters" aria-label="Шаги вызова" data-shown={active >= 0 ? '' : undefined}>
      <ol className="chapters__list">
        {chapters.map((c, i) => (
          <li key={c.label}>
            <a
              href={`#${c.ids[0]}`}
              className="chapters__item"
              aria-current={i === active ? 'step' : undefined}
              data-done={i < active ? '' : undefined}
              tabIndex={active >= 0 ? undefined : -1}
            >
              <span className="chapters__num tnum">{String(i + 1).padStart(2, '0')}</span>
              {c.label}
              <span className="chapters__fill" ref={(el) => { fills.current[i] = el }} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
