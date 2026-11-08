'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import { ORDER_HEAD, ORDER_STEPS } from '@/lib/content'
import { SectionHead } from '@/components/ui/SectionHead'
import { BotButton, CallButton } from '@/components/ui/ActionButtons'
import { IPhone } from '@/components/phone/IPhone'
import { TgDemo } from '@/components/phone/TgDemo'

/**
 * Заказ в боте: этапы слева, iPhone справа. Этап становится текущим, когда
 * его начало проходит середину экрана; телефон показывает этот этап.
 *
 * На телефоне посетителя два столбца не помещаются: iPhone закреплён на
 * экране, над ним — подпись текущего этапа, а сам список этапов служит
 * длиной прокрутки (его текст доступен экранному чтецу).
 *
 * Пунктир между номерами — SVG с шагом, подогнанным под длину отрезка:
 * штрихи начинаются и кончаются ровно у кружков, зазоры одинаковые
 * (замечание владельца: прежний пунктир был несимметричный).
 */
export function OrderDemo() {
  const [active, setActive] = useState(-1)
  const [near, setNear] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const reduced = useReducedMotion()

  // Шрифты экрана iPhone включаются, когда блок в полутора экранах от окна.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '150% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = [...list.querySelectorAll<HTMLElement>('.order-step')]
    let raf = 0
    const measure = () => {
      raf = 0
      const line = window.innerHeight * 0.55
      let idx = -1
      items.forEach((el, i) => {
        if (el.getBoundingClientRect().top < line) idx = i
      })
      setActive((prev) => (prev === idx ? prev : idx))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const scene = Math.max(0, active)
  const cap = ORDER_STEPS[scene]

  return (
    <section
      ref={sectionRef}
      id="steps"
      aria-labelledby="steps-title"
      className={`section shell order${near ? ' is-near' : ''}`}
    >
      <SectionHead id="steps-title" {...ORDER_HEAD} />

      <div className="order-wrap">
        <div className="order-stage">
          <div className="order-cap" aria-hidden="true">
            <span className="order-cap__no">
              {scene + 1}
              <span>/{ORDER_STEPS.length}</span>
            </span>
            <span key={scene} className="order-cap__body">
              <b>{cap.title}</b>
              <span>{cap.text}</span>
            </span>
          </div>
          <figure className="order-phone">
            <IPhone>
              <TgDemo scene={scene} play={active >= 0 && !reduced} />
            </IPhone>
            <figcaption className="sr-only">
              Заказ эвакуатора в Telegram-боте на экране iPhone: чат, форма заявки и статусы.
            </figcaption>
          </figure>
        </div>

        <ol ref={listRef} className="order-steps">
          {ORDER_STEPS.map((s, i) => (
            <li key={s.title} className={`order-step${i <= active ? ' is-lit' : ''}`}>
              <span className="order-node" aria-hidden="true">
                {i + 1}
              </span>
              {i < ORDER_STEPS.length - 1 && <Dashes lit={i < active} />}
              <div className="order-step__body">
                {s.status && (
                  <p className="route-status">
                    <span className="sr-only">Статус в боте: </span>
                    {s.status}
                  </p>
                )}
                <h3>{s.title}</h3>
                <p className="order-step__text">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="order-cta">
        <BotButton />
        <CallButton withNumber />
      </div>
    </section>
  )
}

/** Штрих и желаемый зазор, px. Зазор подгоняется под длину отрезка. */
const DASH = 12
const GAP = 10

function Dashes({ lit }: { lit: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [len, setLen] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLen(Math.round(e.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // n штрихов и n−1 зазоров ровно на всю длину: первый штрих у верхнего
  // кружка, последний — у нижнего.
  const n = Math.max(1, Math.round((len + GAP) / (DASH + GAP)))
  const gap = n > 1 ? (len - n * DASH) / (n - 1) : 0
  const dash = `${DASH} ${gap.toFixed(2)}`

  return (
    <span ref={ref} className={`order-dashes${lit ? ' is-lit' : ''}`} aria-hidden="true">
      {len > 0 && (
        <>
          <svg width="2" height={len} viewBox={`0 0 2 ${len}`}>
            <line x1="1" y1="0" x2="1" y2={len} className="order-dashes__base" strokeDasharray={dash} />
          </svg>
          {/* Янтарная копия сверху раскрывается вниз, когда загорается следующий этап. */}
          <span className="order-dashes__fill">
            <svg width="2" height={len} viewBox={`0 0 2 ${len}`}>
              <line x1="1" y1="0" x2="1" y2={len} className="order-dashes__lit" strokeDasharray={dash} />
            </svg>
          </span>
        </>
      )}
    </span>
  )
}
