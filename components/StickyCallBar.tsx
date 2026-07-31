'use client'

import { useEffect, useRef, useState } from 'react'

import { BotButton, CallButton } from '@/components/ui/ActionButtons'

/**
 * Прилипшая панель с двумя кнопками для узких экранов.
 *
 * Появляется после первого экрана: пока кнопки видны в самом первом экране,
 * панель их только дублирует и отъедает высоту у кадра промотки.
 *
 * Момент появления ловится не слушателем скролла, а IntersectionObserver по
 * метке, стоящей ровно на высоте одного экрана от верха страницы. Слушатель
 * скролла здесь работал бы против ядра: промотка видео и так живёт на каждом
 * кадре, и вешать на тот же скролл ещё и состояние React — верный способ
 * получить рывки на трекпаде.
 *
 * Панель есть в разметке всегда и просто уезжает за нижнюю кромку — так она не
 * двигает вёрстку и остаётся на виду там, где показать её нечему, то есть без
 * JS. Прятание сделано через visibility, а не через атрибут: убранная панель не
 * должна ловить ни фокус с клавиатуры, ни касания по нижней кромке экрана, и
 * это должно быть свойством стиля, а не состояния — иначе в статической
 * разметке она уедет заблокированной и без JS кнопки перестанут нажиматься.
 */
export function StickyCallBar() {
  const [shown, setShown] = useState(false)
  const markRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mark = markRef.current
    if (!mark) return

    const io = new IntersectionObserver(
      ([entry]) => {
        // Метка ушла вверх — первый экран позади. При возврате наверх она
        // возвращается в окно, и панель убирается обратно.
        setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      },
      { threshold: 0 },
    )
    io.observe(mark)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div ref={markRef} className="sticky-bar-mark" aria-hidden="true" />

      <div className="sticky-bar" data-shown={shown ? '' : undefined}>
        <div className="flex gap-2.5">
          <CallButton className="flex-1" />
          <BotButton className="flex-1" />
        </div>
      </div>
    </>
  )
}
