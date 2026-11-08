import { PHONE_DISPLAY, PHONE_HREF, REGION } from '@/lib/config'
import { FINAL } from '@/lib/content'
import { BotButton } from '@/components/ui/ActionButtons'
import { SaveShare } from '@/components/ui/SaveShare'

/**
 * Финал — единственное залитое красным поле на странице: здесь человек
 * решает. Огромный номер — сама кнопка звонка.
 */
export function FinalCta() {
  return (
    <section id="call" aria-labelledby="call-title" className="final">
      <div className="final__inner shell">
        <h2 id="call-title" className="final__title h-light">
          {FINAL.title}
          <span className="line-accent mt-1">{FINAL.accent}</span>
        </h2>
        <a href={PHONE_HREF} className="final__phone" aria-label={`Позвонить: ${PHONE_DISPLAY}`}>
          {PHONE_DISPLAY}
        </a>
        <p className="final__meta">Круглосуточно, без выходных · {REGION}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
          <BotButton tone="red" />
          <SaveShare className="save-share" />
        </div>
      </div>
    </section>
  )
}
