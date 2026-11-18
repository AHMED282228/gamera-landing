import { PHONE_DISPLAY, PHONE_HREF, SUBSCRIBER_DISCOUNT } from '@/lib/config'
import { FAQ, FAQ_HEAD } from '@/lib/content'
import { SectionHead } from '@/components/ui/SectionHead'
import { FaqItem } from '@/components/sections/FaqItem'

/**
 * Частые вопросы — нативные details/summary: работают без JS, с клавиатуры и
 * в поиске (разметка FAQPage — lib/jsonld.ts берёт тот же список). Плавное
 * раскрытие — FaqItem.
 */
export function faqItems() {
  const items: { q: string; a: string }[] = FAQ.map((f) => ({ q: f.q, a: f.a }))
  if (SUBSCRIBER_DISCOUNT > 0) {
    items.push({
      q: 'Есть скидка?',
      a: `Да, ${SUBSCRIBER_DISCOUNT} ₽ подписчикам нашего Telegram-канала. Подпишитесь и при заказе скажите, что вы подписчик.`,
    })
  }
  return items
}

export function Faq() {
  const items = faqItems()
  return (
    <section id="faq" aria-labelledby="faq-title" className="section shell">
      <div className="faq">
        <div className="faq__head">
          <SectionHead id="faq-title" {...FAQ_HEAD} />
          <p className="section-intro reveal">
            Не нашли ответа — позвоните:{' '}
            <a href={PHONE_HREF} className="tnum whitespace-nowrap text-ink underline decoration-amber underline-offset-4">
              {PHONE_DISPLAY}
            </a>
          </p>
        </div>
        <div className="faq-list">
          {items.map((f, i) => (
            <FaqItem key={f.q} q={f.q} a={f.a} open={i === 0 ? true : undefined} />
          ))}
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: items.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }),
        }}
      />
    </section>
  )
}
