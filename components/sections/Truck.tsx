'use client'

import { useEffect, useRef, useState } from 'react'

import { TRUCK_HEAD, TRUCK_PARTS } from '@/lib/content'
import { SectionHead } from '@/components/ui/SectionHead'

/**
 * Наш эвакуатор: ночной снимок с точками на деталях. Нажатие — камера
 * подъезжает к детали, рядом карточка с настоящим фото детали.
 */
export function Truck() {
  const [open, setOpen] = useState<number | null>(null)
  const [shown, setShown] = useState(0)
  const closeRef = useRef<HTMLButtonElement>(null)

  const pick = (i: number) => {
    if (open === i) return setOpen(null)
    setShown(i)
    setOpen(i)
  }

  useEffect(() => {
    if (open === null) return
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  const p = TRUCK_PARTS[shown]
  const isOpen = open !== null

  return (
    <section id="truck" aria-labelledby="truck-title" className="section shell">
      <div className="truck">
        <SectionHead id="truck-title" {...TRUCK_HEAD} />
        <div className="rig" data-open={isOpen ? '' : undefined}>
          <div className="rig__stage">
            {/* Временная заглушка: фото и механику блока владелец переделает позже. */}
            {/* Точки с подписями на фото убраны вместе с фото — вернутся с новой механикой. */}
          </div>
          <div className="rig__card" data-side={p.x > 50 ? 'left' : 'right'} role="region" aria-live="polite" aria-label={p.title}>
            <button
              ref={closeRef}
              type="button"
              className="rig__close"
              aria-label="Закрыть, к общему виду"
              tabIndex={isOpen ? 0 : -1}
              onClick={() => setOpen(null)}
            >
              ×
            </button>
            <span className="rig__num">0{shown + 1} / 0{TRUCK_PARTS.length}</span>
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </div>
        </div>
        <ol className="rig__list">
          {TRUCK_PARTS.map((t, i) => (
            <li key={t.title}>
              <button type="button" className="rig__item" aria-pressed={open === i} onClick={() => pick(i)}>
                <span className="rig__inum">{i + 1}</span>
                <b>{t.title}</b>
                <span className="rig__itext">{t.lead}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
