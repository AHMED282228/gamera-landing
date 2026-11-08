import type { Metadata, Viewport } from 'next'
import { Geologica, Golos_Text, Inter, Oswald } from 'next/font/google'

import { BRAND, PHONE_DISPLAY, POSTER_ALT, REGION_SHORT, SITE_URL } from '@/lib/config'
import { businessJsonLd } from '@/lib/jsonld'

import './globals.css'
import './order-demo.css'
import './sections.css'

/*
 * Заголовки — Geologica: кириллица в ней родная, а оси наклона (slnt) и
 * курсивных форм (CRSV) дают вторую строку заголовка тем же шрифтом:
 * тяжёлая прямая строка и лёгкая наклонная. Ось SHRP (острота углов) не
 * берём — без неё файл легче, а первый экран быстрее.
 */
const geologica = Geologica({
  subsets: ['cyrillic', 'latin'],
  axes: ['slnt', 'CRSV'],
  variable: '--font-geologica',
  display: 'swap',
})

const golos = Golos_Text({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-golos',
  display: 'swap',
})

/*
 * Шрифты экрана iPhone в блоке «Заказ в боте»: Inter вместо системного
 * шрифта iOS (близок к нему и одинаков на всех устройствах) и Oswald с Inter —
 * как в самом мини-приложении бота. preload: false — первый экран их не ждёт,
 * а скачиваются они, только когда блок подъезжает к экрану (класс is-near
 * включает их в order-demo.css).
 */
const inter = Inter({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
})

const oswald = Oswald({
  subsets: ['cyrillic', 'latin'],
  weight: ['500', '700'],
  variable: '--font-oswald',
  display: 'swap',
  preload: false,
})

/**
 * Описание держится в 160 знаках — длиннее поисковик обрезает многоточием, и
 * обрывается как раз хвост, ради которого его пишут.
 *
 * Ни срока приезда, ни цены здесь нет: сниппет читают до звонка, и обещание
 * из него человек считает данным.
 */
const DESCRIPTION =
  'Эвакуатор 24/7 в Санкт-Петербурге и Ленобласти. Выдвижные аппарели и лебёдка: заберём после ДТП, заглохшую, с пробитым колесом и низкую машину.'

const OG_ALT = `${BRAND}: эвакуатор 24/7, ${REGION_SHORT}, телефон ${PHONE_DISPLAY}. ${POSTER_ALT}`

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Эвакуатор в СПб и Ленобласти 24/7 — G.AMERA',
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  /*
   * Картинка ссылки — карточка 1200×630 (scripts/make-og.mjs): тот же ночной
   * постер, а внизу «Эвакуатор 24/7» и номер. Раньше здесь стоял голый постер —
   * в пересланной ссылке он говорил только «какой-то эвакуатор». Посетителю
   * сайта карточка не грузится: её берут только мессенджеры и соцсети.
   */
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: SITE_URL,
    siteName: BRAND,
    title: 'Эвакуатор в СПб и Ленобласти 24/7 — G.AMERA',
    description: DESCRIPTION,
    images: [
      {
        url: '/og-1200.jpg',
        width: 1200,
        height: 630,
        alt: OG_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Эвакуатор в СПб и Ленобласти 24/7 — G.AMERA',
    description: DESCRIPTION,
    images: [{ url: '/og-1200.jpg', alt: OG_ALT }],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0A0B0E',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${geologica.variable} ${golos.variable} ${inter.variable} ${oswald.variable}`}
    >
      <head>
        {/*
          Ссылки preload на постер здесь нет намеренно, хотя он и есть элемент
          LCP. React выпускает её сам за картинку, отрисованную на сервере, и
          ставит её в <head> раньше любой написанной руками. Пока ссылка стояла
          и тут, и там, браузер брал React-овскую, а высокий приоритет был
          прописан в нашей — и не применялся вообще. Теперь приоритет живёт на
          самом теге <img> в ScrubStage, откуда React его и переносит.
        */}
        {/*
          Ставим .js до первой отрисовки. По его отсутствию CSS разворачивает
          залипающую секцию в обычный поток, чтобы страница без JS оставалась
          читаемой целиком, а не превращалась в 400vh пустоты.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('js')`,
          }}
        />
        {/*
          Разметка организации. Лежит в <head> статикой, поэтому её видит и
          поисковый робот, который не выполняет скрипты.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(businessJsonLd()),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
