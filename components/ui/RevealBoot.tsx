'use client'

import { useEffect } from 'react'

/**
 * Появление блоков и свет на маршруте.
 *
 * .reveal, .h-light, .truck-figure получают .is-in, когда входят в экран.
 * Уже пролистанное (ушло выше экрана, например переход по якорю) показывается
 * сразу, без анимации — иначе человек видит пустоту на месте текста.
 * .route-step получает .is-lit, когда доезжает до середины экрана, и теряет
 * при прокрутке назад — огни маршрута идут за читателем.
 */
export function RevealBoot() {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('.reveal, .h-light, .truck-figure')
    const pending = new Set<HTMLElement>(nodes)

    const show = (node: HTMLElement, instant: boolean) => {
      if (instant) node.classList.add('reveal-instant')
      node.classList.add('is-in')
      pending.delete(node)
      io.unobserve(node)
    }
    const catchUp = () => {
      for (const node of pending) {
        if (node.getBoundingClientRect().bottom < 0) show(node, true)
      }
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) show(e.target as HTMLElement, false)
        catchUp()
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    nodes.forEach((n) => io.observe(n))

    const steps = document.querySelectorAll<HTMLElement>('.route-step')
    const lit = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const on = e.isIntersecting || e.boundingClientRect.top < 0
          e.target.classList.toggle('is-lit', on)
        }
      },
      { rootMargin: '0px 0px -50% 0px' },
    )
    steps.forEach((s) => lit.observe(s))

    return () => {
      io.disconnect()
      lit.disconnect()
    }
  }, [])

  return null
}
