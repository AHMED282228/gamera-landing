'use client'

import { motion, useTransform, type MotionValue } from 'motion/react'
import type { CSSProperties } from 'react'

import { SUBSCRIBER_DISCOUNT, TG_CHANNEL } from '@/lib/config'
import { HERO as COPY, LOADING } from '@/lib/content'
import { HERO, HERO_ANCHOR } from '@/lib/scrubTimeline'
import { BotButton, CallButton } from '@/components/ui/ActionButtons'

/**
 * Первый экран: что это, где работают, и сразу два способа вызвать.
 * С первым движением колеса уходит вверх и уступает место подписям этапов.
 */
export function HeroCopy({ progress, chapter = false }: { progress: MotionValue<number>; chapter?: boolean }) {
  const opacity = useTransform(progress, [HERO.from, HERO.to], [1, 0])
  const y = useTransform(progress, [HERO.from, HERO.to], [0, -24], { clamp: true })
  const pointerEvents = useTransform(progress, (p) => (p >= HERO.to ? 'none' : 'auto'))

  return (
    <motion.div
      className="hero-copy"
      style={{ opacity, y, pointerEvents, '--anchor': HERO_ANCHOR } as unknown as CSSProperties}
    >
      {chapter ? (
        <>
          <h2 className="text-hero text-ink">
            {LOADING.title}
            <span className="line-accent mt-1">{LOADING.accent}</span>
          </h2>
          <p className="prose-measure mt-6 text-lead text-ink-2">{LOADING.lead}</p>
        </>
      ) : (
      <>
      <h1 className="text-hero text-ink">
        {COPY.title}
        <span className="line-accent mt-1">{COPY.accent}</span>
      </h1>

      <p className="prose-measure mt-6 text-lead text-ink-2">{COPY.lead}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <BotButton />
        <CallButton withNumber />
      </div>

      <p className="hero-note">
        <span>
          <span className="live-dot" aria-hidden="true" />
          <b>Круглосуточно</b>, без выходных
        </span>
        {SUBSCRIBER_DISCOUNT > 0 && (
          <a href={TG_CHANNEL} target="_blank" rel="noopener" className="underline decoration-line-strong underline-offset-4 hover:decoration-amber">
            −{SUBSCRIBER_DISCOUNT} ₽ подписчикам канала
          </a>
        )}
      </p>
      </>
      )}
    </motion.div>
  )
}
