import { BRAND, LOGO, PHONE_DISPLAY, PHONE_HREF, REGION, TG_BOT, TG_CHANNEL, TG_LINK } from '@/lib/config'

const NAV = [
  ['#cases', 'Когда вызывают'],
  ['#steps', 'Как проходит вызов'],
  ['#truck', 'Наш эвакуатор'],
  ['#photos', 'Фото с вызовов'],
  ['#coverage', 'Зона выезда'],
  ['#faq', 'Вопросы'],
] as const

export function SiteFooter() {
  return (
    <footer className="site-footer shell">
      <div className="footer-grid">
        <div>
          <div className="brand">
            <img
              src={LOGO.mark.src}
              width={LOGO.mark.width}
              height={LOGO.mark.height}
              alt=""
              aria-hidden="true"
              className="brand-mark"
              loading="lazy"
            />
            <span className="brand-name">{BRAND}</span>
          </div>
          <p className="mt-4 max-w-[34ch]">
            Эвакуатор в Санкт-Петербурге и Ленинградской области. Круглосуточно, без выходных.
          </p>
        </div>
        <nav aria-label="Разделы">
          <h3>Разделы</h3>
          <ul>
            {NAV.map(([href, label]) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h3>Связь</h3>
          <ul>
            <li>
              <a href={PHONE_HREF} className="tnum">
                {PHONE_DISPLAY}
              </a>
            </li>
            <li>
              <a href={TG_LINK} target="_blank" rel="noopener">
                Бот @{TG_BOT}
              </a>
            </li>
            <li>
              <a href={TG_CHANNEL} target="_blank" rel="noopener">
                Канал с вызовами
              </a>
            </li>
            <li>{REGION}</li>
          </ul>
        </div>
      </div>
      <p className="mt-10">
        © {new Date().getFullYear()} {BRAND}
      </p>
    </footer>
  )
}
