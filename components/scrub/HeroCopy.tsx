'use client'

import { motion, useTransform, type MotionValue } from 'motion/react'
import type { CSSProperties } from 'react'

import { REGION } from '@/lib/config'
import { HERO, HERO_ANCHOR } from '@/lib/scrubTimeline'
import { BotButton, CallButton } from '@/components/ui/ActionButtons'

/**
 * Первый экран уходит рано и полностью: поле у него общее с подписями, и любое
 * пересечение видно как наложение двух текстов. Границы — в lib/scrubTimeline.
 */
export function HeroCopy({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [HERO.from, HERO.to], [1, 0])
  const y = useTransform(progress, [HERO.from, HERO.to], [0, -24], {
    clamp: true,
  })
  // Растворившийся первый экран не должен перехватывать клики по кнопкам:
  // он всё ещё лежит поверх поля, просто прозрачный.
  const pointerEvents = useTransform(progress, (p) =>
    p >= HERO.to ? 'none' : 'auto',
  )

  return (
    <motion.div
      className="hero-copy"
      style={
        {
          opacity,
          y,
          pointerEvents,
          '--anchor': HERO_ANCHOR,
        } as unknown as CSSProperties
      }
    >
      <p className="eyebrow">Круглосуточно, без выходных</p>

      <h1 className="mt-4 font-display text-hero tracking-[-0.015em] text-ink">
        Эвакуатор 24/7
      </h1>

      {/*
        Платформа не опускается: из-под неё выдвигаются аппарели. Формулировка
        из брифа обещала обратное — исправлено по уточнению владельца.
      */}
      <p className="prose-measure mt-5 text-lead text-steel-2">
        Аппарели выдвигаются из-под платформы и ложатся на асфальт: низкий угол
        заезда, машина заходит без рывков и без риска задеть бампер.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <CallButton />
        <BotButton />
      </div>

      {/* Было --steel-1: 3.54 к фону при требуемых для текста 4.5.
          Он остаётся цветом разделителей и рамок, а не подписей. */}
      <p className="mt-5 text-label text-steel-2">{REGION}</p>
    </motion.div>
  )
}
