import type { Metadata, Viewport } from 'next'
import { Golos_Text, JetBrains_Mono, Oswald } from 'next/font/google'

import { BRAND, POSTER_ALT, SITE_URL } from '@/lib/config'
import { businessJsonLd } from '@/lib/jsonld'

import './globals.css'

const oswald = Oswald({
  subsets: ['cyrillic', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
})

const golos = Golos_Text({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-golos',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
})

/**
 * Описание держится в 160 знаках — длиннее поисковик обрезает многоточием, и
 * обрывается как раз хвост, ради которого его пишут.
 *
 * Ни срока приезда, ни цены здесь нет: сниппет читают до звонка, и обещание
 * из него человек считает данным.
 */
const DESCRIPTION =
  'Эвакуатор в Санкт-Петербурге и Ленинградской области, круглосуточно. Выездные аппарели и лебёдка: заберём после ДТП, с пробитым колесом и заглохшую.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Эвакуатор в СПб и Ленобласти 24/7 — G.AMERA',
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  /*
   * Картинка ссылки — тот же постер, что показывается на первом экране: он уже
   * лежит в трёх размерах и уже скачан. Отдельная картинка под соцсети была бы
   * лишним файлом ради того же кадра.
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
        url: '/media/poster-1280.jpg',
        width: 1280,
        height: 720,
        alt: POSTER_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Эвакуатор в СПб и Ленобласти 24/7 — G.AMERA',
    description: DESCRIPTION,
    images: ['/media/poster-1280.jpg'],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0B070F',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${oswald.variable} ${golos.variable} ${jetbrains.variable}`}
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
