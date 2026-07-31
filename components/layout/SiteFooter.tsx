import { AREA_SERVED, BRAND, LOGO, REGION, TAGLINE } from '@/lib/config'
import { PhoneLink } from '@/components/ui/ActionButtons'

/**
 * Подвал. Логотип целиком показывается только здесь — в шапке для него нет
 * высоты, лого вертикальное, и слово AMERA там ужалось бы до нечитаемого.
 *
 * Картинка ленивая: она ниже первого экрана и не должна отбирать канал
 * ни у постера, ни у клипа.
 *
 * Раньше здесь стояли только логотип слева и телефон справа, а между ними
 * зияла пустая полоса во весь экран. Подвал — последнее, что человек видит,
 * и пустая строка на прощание читается как «сайт кончился, потому что кончились
 * силы». Теперь это сетка из четырёх колонок с оглавлением: заодно появилась
 * навигация, которой на странице не было вовсе — вернуться к нужному разделу
 * можно было только прокруткой.
 */
const NAV = [
  { href: '#cases', label: 'В каких случаях' },
  { href: '#ways', label: 'Позвонить или написать' },
  { href: '#steps', label: 'Как проходит вызов' },
  { href: '#coverage', label: 'Зона работы и цена' },
]

export function SiteFooter() {
  return (
    <footer className="shell border-t border-steel-1/40 pt-block pb-8">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <img
          src={LOGO.full.src}
          width={LOGO.full.width}
          height={LOGO.full.height}
          alt={`${BRAND} — ${TAGLINE.toLowerCase()}`}
          loading="lazy"
          decoding="async"
          className="h-auto w-[11.5rem] self-start"
        />

        <nav aria-label="Разделы страницы">
          <p className="eyebrow mb-4">Разделы</p>
          <ul className="flex flex-col gap-3">
            {NAV.map((n) => (
              <li key={n.href}>
                <a
                  href={n.href}
                  className="font-display text-h3 uppercase tracking-[0.01em] text-steel-3 transition-tint duration-200 hover:text-ink"
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-4 lg:items-end lg:text-right">
          <p className="eyebrow">Круглосуточно</p>
          <PhoneLink size="lead" />
          {/* --steel-1 сюда не годится: 3.54 к фону, а тексту нужно 4.5.
              Он остаётся цветом разделителей и рамок, как и задумано. */}
          <p className="text-label text-steel-2">{REGION}</p>
        </div>
      </div>

      {/*
        Нижняя строка — города текстом. Это не украшение: поисковик читает их
        как подтверждение зоны работы, а человек — как ответ на «а до меня
        доедете». Год не ставим: он не несёт смысла и через год превращается
        в признак заброшенного сайта.
      */}
      <p className="mt-10 border-t border-steel-1/25 pt-6 text-label text-steel-2">
        {BRAND} — {TAGLINE.toLowerCase()}. {AREA_SERVED.join(', ')}. Работаем без
        выходных.
      </p>
    </footer>
  )
}
