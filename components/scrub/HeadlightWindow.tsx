'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { cancelFrame, frame, type MotionValue } from 'motion/react'

import { CAPTIONS, titleOpacityAt } from '@/lib/scrubTimeline'

/**
 * Фара высвечивает клип за подписями (выбор владельца, 7 ноября 2026).
 *
 * Под текстом ровный тёмный фон до носа машины. Луч не рисуется: за подписями
 * «Платформа», «Загрузка», «Крепление» в этой темноте открывается окно-конус от
 * фары, и в нём виден сам клип — фара «высвечивает кусок темноты». Окно
 * раскрывается сверху вниз за первую половину участка подписи, назад — снизу
 * вверх, и гаснет вместе с подписью. Под первым экраном и в паузах окна нет.
 *
 * Буквы подписи «появляются»: вне света прозрачные, в свете — светлые. Это
 * заливка самих букв тем же конусом (background-clip: text), поэтому граница
 * света на буквах и на фоне одна и та же.
 *
 * Окно не сплошной конус на полэкрана: слева оно кончается чуть левее подписи,
 * по высоте — полосой вокруг подписи (PAD сверху и снизу, дальше гаснет за
 * FEATHER). Края конуса мягкие на WSOFT°: у фары край уже, дальше шире — как у
 * настоящего луча. Варианты «как было» (4°) и «ещё мягче» (размытие всего слоя)
 * владелец видел и отклонил; добавки «свет ярче», «дождь в свете», «край
 * света», «свет уходит вниз» — тоже.
 *
 * Картинка клипа начинается под серединой подписи, левее в ролике ничего нет.
 * Чтобы начало текста не стояло на чёрном, размытый свет за кадром продолжен
 * влево и его переход в темноту сдвинут к шкале (globals.css, .scrub-amb--lamp).
 *
 * Только компьютер (шире 768 px): на телефоне текст стоит под кадром, светить
 * из фары на него нечем. Там, при prefers-reduced-motion и без JS слой спрятан
 * CSS-ом, а буквы обычные.
 *
 * Считается не в своём цикле, а в шаге postRender библиотеки анимации: к этому
 * моменту подписи уже сдвинуты, а кадр приближен на этот кадр экрана, поэтому
 * свет не отстаёт от них ни на кадр. Стоит, когда прокрутка стоит.
 */

/** Мягкость края света на буквах, градусы конуса от фары. */
const SOFT = 4
/** Мягкость края окна. У фары угол сходится в точку, на 4° там была резкая линия. */
const WSOFT = 11
/** Окно выше и ниже подписи на PAD px и гаснет ещё за FEATHER px. */
const PAD = 22
const FEATHER = 48
/**
 * Левый край окна — круг от фары: открыт до REACH_IN px левее подписи, закрыт
 * в REACH_OUT px левее неё. Окно здесь ничего не обрезает: там уже ровный
 * тёмный фон, а сам плавный переход света в темноту — в globals.css
 * (.scrub-amb-shade и .scrub-amb--lamp). Резать светлое окном нельзя:
 * получалась ровная вертикальная граница у шкалы (владелец, 7 ноября 2026).
 */
const REACH_IN = 10
const REACH_OUT = 100
/** Буквы в свете: заголовок и абзац, тёплые, как свет фары. */
const LIT = ['#f1e9dd', '#e9e1d5'] as const

type Props = {
  progress: MotionValue<number>
  /** Залипающий кадр: в нём ищутся точка фары (.scrub-lamp) и подписи. */
  stageRef: RefObject<HTMLDivElement | null>
  /** false при prefers-reduced-motion. */
  enabled: boolean
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export function HeadlightWindow({ progress, stageRef, enabled }: Props) {
  const scrimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    const scrim = scrimRef.current
    if (!enabled || !stage || !scrim) return

    const lamp = stage.querySelector<HTMLElement>('.scrub-lamp')
    const caps = [...stage.querySelectorAll<HTMLElement>('.scrub-caption')].map((c) =>
      [c.querySelector<HTMLElement>('h2'), c.querySelector<HTMLElement>('p')].filter(
        (e): e is HTMLElement => e !== null,
      ),
    )
    if (!lamp || caps.length !== CAPTIONS.length) return

    const desktop = window.matchMedia('(min-width: 769px)')
    stage.classList.add('scrub-stage--lamp')

    let mask = ''
    const setMask = (m: string) => {
      if (m === mask) return
      mask = m
      scrim.style.setProperty('-webkit-mask-image', m)
      scrim.style.setProperty('mask-image', m)
    }
    /** Подпись, у которой сейчас залиты буквы, — её надо погасить при смене. */
    let painted = -1
    const unpaint = () => {
      if (painted < 0) return
      for (const el of caps[painted]) el.style.backgroundImage = ''
      painted = -1
    }
    let spill = ''
    const setSpill = (b: string) => {
      if (b === spill) return
      spill = b
      scrim.style.backgroundImage = b
    }
    const clear = () => {
      setMask('')
      setSpill('')
      unpaint()
    }

    const update = () => {
      const mobile = !desktop.matches
      const p = progress.get()
      const i = CAPTIONS.findIndex((c) => p > c.from && p < c.to)
      if (i < 0) return clear()
      const band = CAPTIONS[i]
      const alpha = titleOpacityAt(p, band)
      if (alpha < 0.003) return clear()

      // Сначала все замеры, потом все записи — без лишних пересчётов раскладки.
      const L = lamp.getBoundingClientRect()
      const S = scrim.getBoundingClientRect()
      const rs = caps[i].map((e) => e.getBoundingClientRect())
      const lx = L.left
      const ly = L.top

      // Угол как у conic-gradient: 0° — вверх, по часовой; 270° — влево от фары.
      const ang = (x: number, y: number) => (Math.atan2(x - lx, -(y - ly)) * 180 / Math.PI + 360) % 360
      const x0 = Math.min(...rs.map((r) => r.left))
      const x1 = Math.max(...rs.map((r) => r.right))
      const y0 = Math.min(...rs.map((r) => r.top))
      const y1 = Math.max(...rs.map((r) => r.bottom))
      const cs = [ang(x0, y0), ang(x1, y0), ang(x0, y1), ang(x1, y1)]
      const top = Math.min(360 - SOFT, Math.max(...cs) + SOFT)
      const bottom = Math.min(...cs) - SOFT
      // Нижний край света ползёт от верха подписи вниз за первую половину участка.
      const t = clamp01((p - band.from) / ((band.to - band.from) * 0.5))
      const a1 = top - (top - bottom) * t
      const a2 = top
      if (a2 - a1 < 0.05) return clear()

      const wedge = (cx: number, cy: number, col: string, soft: number) => {
        const s1 = Math.max(0, a1 - soft)
        const s2 = Math.min(360, a2 + soft)
        return `conic-gradient(from 0deg at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, transparent 0deg, transparent ${s1.toFixed(2)}deg, ${col} ${a1.toFixed(2)}deg, ${col} ${a2.toFixed(2)}deg, transparent ${s2.toFixed(2)}deg, transparent 360deg)`
      }

      // Окно в координатах слоя: конус ∩ круг чуть левее подписи ∩ полоса по её высоте.
      const cx = lx - S.left
      const cy = ly - S.top
      const b0 = y0 - S.top - PAD
      const b1 = y1 - S.top + PAD
      const reach = Math.hypot(lx - x0, ly - (y0 + y1) / 2)
      if (mobile) {
        /* Телефон: подпись стоит под кадром, тёмного слоя нет. Буквы
           проявляет тот же конус от фары в кадре над ними, а под подписью
           ложится тёплый отсвет — свет фары на мокром асфальте. */
        setSpill(wedge(cx, cy, `rgb(243 228 200 / ${(0.075 * alpha).toFixed(3)})`, WSOFT))
        setMask(
          `radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, #000 ${(reach * 0.55).toFixed(0)}px, transparent ${(reach + REACH_OUT * 1.6).toFixed(0)}px)`,
        )
      } else {
      setSpill('')
      setMask(
        [
          'linear-gradient(#000, #000)',
          wedge(cx, cy, `rgb(0 0 0 / ${alpha.toFixed(3)})`, WSOFT),
          `radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, #000 ${(reach + REACH_IN).toFixed(0)}px, transparent ${(reach + REACH_OUT).toFixed(0)}px)`,
          `linear-gradient(to bottom, transparent ${(b0 - FEATHER).toFixed(0)}px, #000 ${b0.toFixed(0)}px, #000 ${b1.toFixed(0)}px, transparent ${(b1 + FEATHER).toFixed(0)}px)`,
        ].join(', '),
      )
      }

      if (painted !== i) unpaint()
      painted = i
      caps[i].forEach((el, k) => {
        el.style.backgroundImage = wedge(lx - rs[k].left, ly - rs[k].top, LIT[k] ?? LIT[1], SOFT)
      })
    }

    const schedule = () => frame.postRender(update)
    const unsubscribe = progress.on('change', schedule)
    window.addEventListener('resize', schedule)
    desktop.addEventListener('change', schedule)
    schedule()

    return () => {
      unsubscribe()
      cancelFrame(update)
      window.removeEventListener('resize', schedule)
      desktop.removeEventListener('change', schedule)
      clear()
      stage.classList.remove('scrub-stage--lamp')
    }
  }, [progress, stageRef, enabled])

  return <div ref={scrimRef} className="scrub-lamp-scrim" aria-hidden="true" />
}
