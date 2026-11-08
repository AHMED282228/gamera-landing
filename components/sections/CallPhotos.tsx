import type { CSSProperties } from 'react'

import { CALL_PHOTOS, SUBSCRIBER_DISCOUNT, TG_CHANNEL } from '@/lib/config'
import { PHOTOS_HEAD } from '@/lib/content'
import { ChannelLink } from '@/components/ui/ActionButtons'
import { ArrowUpRight } from '@/components/ui/Icons'
import { SectionHead } from '@/components/ui/SectionHead'

/**
 * Фото с настоящих вызовов — из канала владельца, каждое ведёт на свой пост.
 * Номера машин на фоне замазаны. Снимки идут лесенкой, как кадры плёнки.
 */
export function CallPhotos() {
  return (
    <section id="photos" aria-labelledby="photos-title" className="section shell">
      <SectionHead id="photos-title" {...PHOTOS_HEAD} />
      <ul className="photos">
        {CALL_PHOTOS.map((p, i) => (
          <li key={p.post} className="reveal" style={{ '--i': i } as CSSProperties}>
            <a
              href={`${TG_CHANNEL}/${p.post}`}
              target="_blank"
              rel="noopener"
              className="photo-tile"
              aria-label={`${p.alt} — пост в канале`}
            >
              <img
                className="photo-tile__img"
                src={p.src}
                srcSet={`${p.small} 400w, ${p.src} 600w`}
                sizes="(max-width: 900px) 46vw, 22vw"
                width={600}
                height={800}
                loading="lazy"
                decoding="async"
                alt={p.alt}
              />
              <span className="photo-tile__tag" aria-hidden="true">
                Пост в канале
                <ArrowUpRight />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div className="channel-row reveal">
        <ChannelLink label="Все вызовы в Telegram-канале" />
        {SUBSCRIBER_DISCOUNT > 0 && (
          <p className="discount">
            <strong>−{SUBSCRIBER_DISCOUNT} ₽</strong>
            <span>скидка подписчикам канала. Условия — в канале.</span>
          </p>
        )}
      </div>
    </section>
  )
}
