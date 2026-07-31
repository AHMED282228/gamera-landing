'use client'

import { motion, useTransform, type MotionValue } from 'motion/react'
import type { CSSProperties } from 'react'

import { anchorOf, ENTER, EXIT, RISE, STAGGER } from '@/lib/scrubTimeline'

type Props = {
  progress: MotionValue<number>
  /** Участок секции, на котором подпись живёт. */
  from: number
  to: number
  title: string
  text: string
}

/**
 * Подпись занимает то же поле, что и первый экран: текст сменяется, а место
 * остаётся. Затемнять под ней нечего — поле лежит на чистом --bg, левее кадра.
 */
export function ScrubCaption({ progress, from, to, title, text }: Props) {
  const span = to - from
  const enterEnd = from + span * ENTER
  const exitStart = to - span * EXIT

  const titleOpacity = useTransform(
    progress,
    [from, enterEnd, exitStart, to],
    [0, 1, 1, 0],
  )
  const titleY = useTransform(progress, [from, enterEnd], [RISE, 0], {
    clamp: true,
  })

  const textFrom = from + span * ENTER * STAGGER
  const textEnterEnd = enterEnd + span * ENTER * STAGGER
  const textOpacity = useTransform(
    progress,
    [textFrom, textEnterEnd, exitStart, to],
    [0, 1, 1, 0],
  )
  const textY = useTransform(progress, [textFrom, textEnterEnd], [RISE, 0], {
    clamp: true,
  })

  return (
    <div
      className="scrub-caption pointer-events-none"
      style={{ '--anchor': anchorOf({ from, to }) } as unknown as CSSProperties}
    >
      <motion.h2
        style={{ opacity: titleOpacity, y: titleY }}
        className="font-display text-h2 tracking-[0.01em] text-ink"
      >
        {title}
      </motion.h2>
      <motion.p
        style={{ opacity: textOpacity, y: textY }}
        className="mt-4 text-lead text-steel-2"
      >
        {text}
      </motion.p>
    </div>
  )
}
