'use client'

import { motion, type MotionValue } from 'motion/react'
import type { CSSProperties } from 'react'

/**
 * Шкала вдоль текстового поля: неподвижная стальная линия и янтарный ползунок,
 * едущий по ней вместе с прокруткой. Заменяет собой индикатор, висящий в углу —
 * так телеметрия привязана к тексту, а не живёт отдельной жизнью.
 *
 * Прогресс уезжает в CSS-переменную числом, а в длину его переводит уже CSS.
 * Благодаря этому ползунок и высоты текстовых блоков считаются от одной и той
 * же величины и не могут разъехаться.
 */
export function PhaseRail({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="scrub-rail" aria-hidden="true">
      <motion.span
        className="scrub-marker"
        style={{ '--p': progress } as unknown as CSSProperties}
      />
    </div>
  )
}
