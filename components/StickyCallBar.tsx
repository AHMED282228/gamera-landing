'use client'

import { useEffect, useRef, useState } from 'react'

import { BotButton, CallButton } from '@/components/ui/ActionButtons'

/**
 * Панель вызова появляется, когда первый экран с его кнопками ушёл вверх.
 * На телефоне — во всю ширину снизу, на компьютере — компактно справа.
 * Прячется у финального блока: там те же кнопки крупно.
 */
export function StickyCallBar() {
  const [shown, setShown] = useState(false)
  const markRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mark = markRef.current
    if (!mark) return
    const final = document.getElementById('call')
    let past = false
    let atFinal = false
    const apply = () => setShown(past && !atFinal)
    const io = new IntersectionObserver(([e]) => {
      past = !e.isIntersecting && e.boundingClientRect.top < 0
      apply()
    })
    io.observe(mark)
    const io2 = new IntersectionObserver(
      ([e]) => {
        atFinal = e.isIntersecting
        apply()
      },
      { threshold: 0.35 },
    )
    if (final) io2.observe(final)
    return () => {
      io.disconnect()
      io2.disconnect()
    }
  }, [])

  return (
    <>
      <div ref={markRef} className="sticky-bar-mark" aria-hidden="true" />
      <div className="sticky-bar" data-shown={shown ? '' : undefined}>
        <div className="flex gap-2">
          <BotButton className="flex-1" />
          <CallButton className="flex-1" compact />
        </div>
      </div>
    </>
  )
}
