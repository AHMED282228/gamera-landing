'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * iPhone 17 Pro в натуральных пропорциях. Внутри всё размечено в точках
 * экрана iPhone (402 × 874, как CSS-пиксели в Safari на этом телефоне),
 * а весь корпус уменьшается одним transform под доступное место. Поэтому
 * шрифты, отступы и скругления внутри — ровно те, что на настоящем экране.
 *
 * Размеры: экран 402 × 874 pt, скругление экрана 62; корпус 150 × 71,9 мм
 * ≈ 434 × 906 pt; Dynamic Island ≈ 125 × 37 pt в 11 pt от верха экрана.
 *
 * Масштаб --k считает ResizeObserver по рамке .iphone-fit. Без JS работает
 * значение по умолчанию из CSS.
 */
export const PHONE_W = 434
export const PHONE_H = 906

export function IPhone({ children }: { children: ReactNode }) {
  const fitRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = fitRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (!width || !height) return
      const k = Math.min(width / PHONE_W, height / PHONE_H)
      el.style.setProperty('--k', k.toFixed(4))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={fitRef} className="iphone-fit">
      <div className="iphone" aria-hidden="true">
        <span className="iphone__key iphone__key--action" />
        <span className="iphone__key iphone__key--vol-up" />
        <span className="iphone__key iphone__key--vol-down" />
        <span className="iphone__key iphone__key--power" />
        <span className="iphone__key iphone__key--camera" />
        <div className="iphone__bezel">
          <div className="iphone__screen">{children}</div>
          <span className="iphone__island">
            <span className="iphone__lens" />
          </span>
        </div>
      </div>
    </div>
  )
}
