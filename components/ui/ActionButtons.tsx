import { PHONE_DISPLAY, PHONE_HREF, TG_CHANNEL, TG_CONFIGURED, TG_LINK } from '@/lib/config'
import { ArrowUpRight, PhoneIcon, TelegramIcon } from './Icons'

/**
 * Кнопки вызова. Обычные ссылки: работают без JS и открываются в одно касание.
 *
 * Бот — главная (красная), звонок — рядом, всегда: Telegram в России
 * замедляют, и у части людей он может не открыться.
 */

type Tone = 'dark' | 'red'

export function BotButton({ className = '', tone = 'dark' }: { className?: string; tone?: Tone }) {
  if (!TG_CONFIGURED) return null
  return (
    <a
      href={TG_LINK}
      target="_blank"
      rel="noopener"
      className={`btn btn-motion ${tone === 'red' ? 'btn--light' : 'btn--primary'} ${className}`}
    >
      <TelegramIcon className="btn__icon" />
      Заказать в боте
    </a>
  )
}

/**
 * withNumber: «Позвонить · 8 (911) …» — номер виден, его можно продиктовать
 * или набрать с другого телефона. compact: в узкой панели на компьютере
 * вместо слова показывается сам номер (.call-word / .call-num).
 */
export function CallButton({
  className = '',
  withNumber = false,
  compact = false,
  tone = 'dark',
}: {
  className?: string
  withNumber?: boolean
  compact?: boolean
  tone?: Tone
}) {
  const look = tone === 'red' ? 'btn--outline-light' : TG_CONFIGURED ? 'btn--ghost' : 'btn--primary'
  return (
    <a href={PHONE_HREF} className={`btn btn-motion ${look} ${className}`}>
      <PhoneIcon className="btn__icon" />
      {compact ? (
        <>
          <span className="call-word">Позвонить</span>
          <span className="call-num">{PHONE_DISPLAY}</span>
        </>
      ) : (
        <>
          <span className="call-label">Позвонить</span>
          {withNumber && <span className="btn__sub tnum">{PHONE_DISPLAY}</span>}
        </>
      )}
    </a>
  )
}

export function ChannelLink({ label = 'Открыть канал', className = '' }: { label?: string; className?: string }) {
  return (
    <a href={TG_CHANNEL} target="_blank" rel="noopener" className={`link-arrow ${className}`}>
      {label}
      <ArrowUpRight />
    </a>
  )
}
