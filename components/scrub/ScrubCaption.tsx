'use client'

import { motion, useTransform, type MotionValue } from 'motion/react'
import type { CSSProperties } from 'react'

import { anchorOf, captionKeys, RISE } from '@/lib/scrubTimeline'

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
 * остаётся. Одно слово заголовком и строка под ним. Буквы проявляет свет
 * фары (HeadlightWindow).
 */
export function ScrubCaption({ progress, from, to, title, text }: Props) {
  const { enterEnd, exitStart, textFrom, textEnterEnd } = captionKeys({ from, to })

  const titleOpacity = useTransform(
    progress,
    [from, enterEnd, exitStart, to],
    [0, 1, 1, 0],
  )
  const titleY = useTransform(progress, [from, enterEnd], [RISE, 0], {
    clamp: true,
  })

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
        className="text-h2 text-ink"
      >
        {title}
      </motion.h2>
      <motion.p
        style={{ opacity: textOpacity, y: textY }}
        className="mt-3 text-lead text-ink-2"
      >
        {text}
      </motion.p>
    </div>
  )
}
