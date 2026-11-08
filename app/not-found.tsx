import type { Metadata } from 'next'

import { BotButton, CallButton } from '@/components/ui/ActionButtons'
import { BASE_PATH, BRAND, LOGO, REGION } from '@/lib/config'

/**
 * Страница 404 (out/404.html). Раньше была стандартная английская от Next:
 * «This page could not be found» — без номера и бота.
 *
 * Сюда попадают по старой или опечатанной ссылке, и часто — с машиной, которая
 * уже встала. Поэтому здесь не извинения, а те же два действия, что на главной:
 * бот первым, телефон рядом. И ссылка на главную — для тех, кто не спешит.
 *
 * Сервер должен отдавать этот файл на ненайденные адреса (nginx:
 * `error_page 404 /404.html;`).
 */
export const metadata: Metadata = {
  title: `Страница не найдена — ${BRAND}`,
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <main className="shell flex min-h-svh flex-col py-section">
      <a href={`${BASE_PATH}/`} className="flex items-center gap-3 self-start" aria-label={`${BRAND} — на главную`}>
        <img src={LOGO.mark.src} width={LOGO.mark.width} height={LOGO.mark.height} alt="" className="h-9 w-auto" />
        <span className="brand-name">{BRAND}</span>
      </a>

      <div className="my-auto pt-block">
        <h1 className="text-h1 text-ink">
          Такой страницы нет
          <span className="line-accent mt-1">но эвакуатор есть</span>
        </h1>
        <p className="prose-measure mt-6 text-lead text-ink-2">
          Адрес устарел или набран с ошибкой. Если машина уже стоит — дальше искать не нужно:
          эвакуатор круглосуточно, {REGION}.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <BotButton />
          <CallButton withNumber />
        </div>

        <a href={`${BASE_PATH}/`} className="link-arrow mt-8">
          На главную
        </a>
      </div>
    </main>
  )
}
