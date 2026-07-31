import { BRAND, LOGO, PHONE_DISPLAY, PHONE_HREF, TAGLINE } from '@/lib/config'

/**
 * Шапка лежит поверх первого экрана, а не над ним отдельной полосой: секция
 * промотки занимает всю высоту окна, и любая полоса сверху отъедала бы от неё
 * место. Фона у шапки нет — под ней в этом месте чистый --bg.
 *
 * Не прилипающая. Прилипшая шапка на залипающей секции даёт две неподвижные
 * панели одновременно и съедает высоту кадра. Ниже первого экрана до телефона
 * доводят кнопка в блоке «как проходит вызов», блок стоимости и финальный CTA,
 * а на мобильном — прилипшая панель внизу.
 */
export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 shell pt-6">
      <div className="flex items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-3" aria-label={BRAND}>
          {/*
            Размеры проставлены явно: без них место под картинку не занято до
            загрузки, и шапка дёргается при её появлении.

            Приоритет намеренно обычный. Знак стоит в первом экране, но элемент
            LCP — постер, и поднимать логотип в тот же высокий приоритет значит
            ставить 9 КБ в очередь перед картинкой, от которой считается
            скорость открытия. Свои 9 КБ он доберёт следом и без гонки.
          */}
          <img
            src={LOGO.mark.src}
            width={LOGO.mark.width}
            height={LOGO.mark.height}
            alt=""
            aria-hidden="true"
            className="h-9 w-auto"
          />
          <span className="flex flex-col leading-none">
            <span className="font-display text-h3 uppercase tracking-[0.02em] text-ink">
              {BRAND}
            </span>
            {/* Не --red: у него к фону 3.28, мелкому тексту нужно 4.5.
                Осветлённый фирменный красный даёт 5.40. */}
            <span className="mt-1 font-mono text-hud uppercase tracking-[0.16em] text-red-text">
              {TAGLINE}
            </span>
          </span>
        </a>

        {/* На узком экране номер уступает место логотипу: внизу висит панель
            с той же кнопкой, дублировать её в шапке незачем. */}
        <a
          href={PHONE_HREF}
          className="hidden font-mono text-mono tracking-[0.06em] text-steel-3 transition-tint duration-200 hover:text-ink sm:block"
        >
          {PHONE_DISPLAY}
        </a>
      </div>
    </header>
  )
}
