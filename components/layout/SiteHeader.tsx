import { BRAND, LOGO, PHONE_DISPLAY, PHONE_HREF } from '@/lib/config'
import { BotButton } from '@/components/ui/ActionButtons'
import { PhoneIcon } from '@/components/ui/Icons'

/**
 * Шапка лежит поверх первого экрана и уезжает вместе с ним; дальше звонок и
 * бот живут в прилипшей панели. На телефоне справа — круглая кнопка звонка:
 * номер целиком в шапку не помещается рядом со знаком.
 */
export function SiteHeader() {
  return (
    <header className="site-header shell">
      <div className="flex items-center justify-between gap-4">
        <a href="#top" className="brand" aria-label={`${BRAND} — наверх`}>
          {/* Размеры заданы: место под знак занято до загрузки, шапка не дёргается.
              Приоритет обычный — элемент LCP здесь постер, а не знак. */}
          <img
            src={LOGO.mark.src}
            width={LOGO.mark.width}
            height={LOGO.mark.height}
            alt=""
            aria-hidden="true"
            className="brand-mark"
          />
          <span>
            <span className="brand-name">{BRAND}</span>
            <span className="brand-sub">Эвакуатор 24/7</span>
          </span>
        </a>

        <div className="flex items-center gap-6">
          <a href={PHONE_HREF} className="header-phone tnum hidden sm:inline">
            {PHONE_DISPLAY}
          </a>
          <BotButton className="btn--sm hidden lg:inline-flex" />
          <a href={PHONE_HREF} className="header-call" aria-label={`Позвонить: ${PHONE_DISPLAY}`}>
            <PhoneIcon className="h-5 w-5" />
          </a>
        </div>
      </div>
    </header>
  )
}
