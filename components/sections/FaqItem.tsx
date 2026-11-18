'use client'

import { useRef, type MouseEvent } from 'react'

/** Тот же ход, что у раскрытия в обзоре (--ease-out-quart). */
const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)'
const MS = 450

/**
 * Вопрос с плавным раскрытием. Основа — нативные details/summary (работают без
 * JS, с клавиатуры, читаются поиском); JS только анимирует высоту ответа, чтобы
 * блоки ниже (красное поле) не прыгали, а съезжали вместе с ним.
 */
export function FaqItem({ q, a, open }: { q: string; a: string; open?: boolean }) {
  const itemRef = useRef<HTMLDetailsElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const anim = useRef<Animation | null>(null)

  const toggle = (e: MouseEvent) => {
    const d = itemRef.current
    const b = bodyRef.current
    if (!d || !b || !b.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    e.preventDefault()
    const closing = d.dataset.closing === ''
    const opening = !d.open || closing
    // Высота сейчас — в том числе посреди прошлой анимации.
    const from = d.open ? b.getBoundingClientRect().height : 0
    anim.current?.cancel()
    if (opening) {
      delete d.dataset.closing
      d.open = true
      const to = b.scrollHeight
      anim.current = b.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: MS, easing: EASE })
      anim.current.onfinish = () => {
        anim.current = null
      }
    } else {
      d.dataset.closing = ''
      anim.current = b.animate([{ height: `${from}px` }, { height: '0px' }], { duration: MS * 0.8, easing: EASE })
      anim.current.onfinish = () => {
        anim.current = null
        d.open = false
        delete d.dataset.closing
      }
    }
  }

  return (
    <details ref={itemRef} className="faq-item" open={open}>
      <summary onClick={toggle}>
        {q}
        {/* Плюс, у открытого — минус: линии 2 px по целым пикселям — чёткие. */}
        <svg className="faq-plus" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
          <circle className="faq-plus__ring" cx="14" cy="14" r="13.5" />
          <path className="faq-plus__line" d="M9 14h10" />
          <path className="faq-plus__line faq-plus__line--v" d="M14 9v10" />
        </svg>
      </summary>
      <div ref={bodyRef} className="faq-body">
        <p className="faq-answer">{a}</p>
      </div>
    </details>
  )
}
