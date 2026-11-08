import { SUBSCRIBER_DISCOUNT, TG_CHANNEL } from '@/lib/config'
import { HERO as COPY } from '@/lib/content'
import { BotButton, CallButton } from '@/components/ui/ActionButtons'
import { HeroLoop } from '@/components/sections/HeroLoop'

/**
 * Первый экран варианта «клип в середине»: что это, где работают и два
 * способа вызвать — без промотки. Кадр — ночь и дождь, машина встала;
 * чем это кончится, страница покажет в главе «Грузим».
 */
export function HeroStatic() {
  return (
    <section className="hero-static" aria-labelledby="hero-title">
      <HeroLoop />
      <div className="hero-static__copy hero-copy shell">
        <h1 id="hero-title" className="text-hero text-ink">
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
      </div>
    </section>
  )
}
