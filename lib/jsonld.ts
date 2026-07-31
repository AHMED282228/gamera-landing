import {
  AREA_SERVED,
  BRAND,
  LOGO,
  PHONE_E164,
  SITE_URL,
  TAGLINE,
} from './config'

/**
 * Разметка организации для поисковиков.
 *
 * Тип AutomotiveBusiness, а не общий LocalBusiness: он точнее и у Яндекса с
 * Google для него больше правил вывода в выдаче.
 *
 * Чего здесь нет и почему:
 *   — address: точного адреса стоянки нет, а выдуманный адрес организации
 *     ломает карточку в картах сильнее, чем его отсутствие;
 *   — priceRange: цены не подтверждены, а «₽₽» ни о чём не говорит;
 *   — aggregateRating: отзывов нет, а размеченный рейтинг без отзывов
 *     считается разметкой-обманом и снимает сниппет целиком.
 *
 * openingHours 00:00–23:59 все семь дней — это и есть «круглосуточно» на языке
 * schema.org.
 *
 * TODO: подставить настоящий домен, когда владелец его подтвердит, — отсюда
 * берутся и @id, и url, и canonical.
 */
export function businessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutomotiveBusiness',
    '@id': `${SITE_URL}/#business`,
    name: BRAND,
    slogan: TAGLINE,
    description:
      'Служба эвакуации в Санкт-Петербурге и Ленинградской области. Эвакуатор с ломаной платформой, выездными аппарелями и лебёдкой. Круглосуточно.',
    url: SITE_URL,
    image: `${SITE_URL}/media/poster-1280.jpg`,
    logo: `${SITE_URL}${LOGO.full.src}`,
    telephone: PHONE_E164,
    areaServed: AREA_SERVED.map((name) => ({
      '@type': 'AdministrativeArea',
      name,
    })),
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        opens: '00:00',
        closes: '23:59',
      },
    ],
  }
}
