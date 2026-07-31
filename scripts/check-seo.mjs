/**
 * Проверяет готовую статику — файл out/index.html, а не страницу в браузере.
 *
 * Разница принципиальная: сайт собирается в статический экспорт как раз ради
 * того, чтобы поисковик получал готовую разметку, не выполняя скриптов. Всё,
 * чего нет в этом файле, для робота не существует, сколько бы React ни дорисовал
 * потом. Поэтому здесь работает грубый разбор текста, а не DOM.
 *
 *   node scripts/check-seo.mjs
 */
import { readFileSync } from 'node:fs'

const FILE = 'out/index.html'
const html = readFileSync(FILE, 'utf8')

let bad = 0
const ok = (cond, label, detail = '') => {
  if (!cond) bad++
  console.log(`  ${cond ? 'ok ' : '✗  '} ${label}${detail ? ` — ${detail}` : ''}`)
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`))
  return m ? m[1] : null
}
const meta = (key, kind = 'name') => {
  const re = new RegExp(`<meta[^>]*${kind}="${key}"[^>]*>`, 'i')
  const m = html.match(re)
  return m ? attr(m[0], 'content') : null
}

console.log('\nязык и заголовки:')
ok(/<html[^>]*lang="ru"/.test(html), 'lang="ru" на <html>')

const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
ok(title.length > 0, 'title заполнен', title)
ok(
  title.includes('Эвакуатор') && title.includes('G.AMERA'),
  'в title есть услуга и название',
)

const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) ?? []
ok(h1.length === 1, 'ровно один <h1>', `найдено ${h1.length}`)

const h2 = html.match(/<h2[^>]*>/g) ?? []
ok(h2.length > 0, 'заголовки второго уровня на месте', `${h2.length} шт.`)

console.log('\nописание и ссылки:')
const desc = meta('description')
ok(Boolean(desc), 'description есть')
ok(
  Boolean(desc) && desc.length <= 160,
  'description укладывается в 160 знаков',
  `${desc?.length ?? 0}`,
)

const canonical = html.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0]
ok(Boolean(canonical), 'canonical есть', canonical ? attr(canonical, 'href') : '')

console.log('\nOpen Graph:')
for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
  ok(Boolean(meta(k, 'property')), k)
}
ok(meta('og:locale', 'property') === 'ru_RU', 'og:locale = ru_RU')

console.log('\nразметка организации:')
const ld = html.match(
  /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
)?.[1]
ok(Boolean(ld), 'JSON-LD в статике')
if (ld) {
  let data = null
  try {
    data = JSON.parse(ld)
  } catch (e) {
    ok(false, 'JSON-LD разбирается', String(e.message))
  }
  if (data) {
    ok(data['@type'] === 'AutomotiveBusiness', '@type = AutomotiveBusiness')
    ok(Boolean(data.telephone), 'телефон указан', data.telephone)
    ok(Array.isArray(data.areaServed) && data.areaServed.length === 2, 'зона работы')
    const h = data.openingHoursSpecification?.[0]
    ok(h?.dayOfWeek?.length === 7, 'все семь дней недели')
    ok(h?.opens === '00:00' && h?.closes === '23:59', 'круглосуточно')
    // Разметка без отзывов, но с рейтингом считается обманом и убирает сниппет.
    ok(!('aggregateRating' in data), 'нет выдуманного рейтинга')
    ok(!('priceRange' in data), 'нет неподтверждённой цены')
  }
}

console.log('\nкартинки:')
const imgs = html.match(/<img[^>]*>/g) ?? []
const noAlt = imgs.filter((t) => attr(t, 'alt') === null)
ok(noAlt.length === 0, 'у всех картинок есть alt', `без alt: ${noAlt.length}`)

const poster = imgs.find((t) => (attr(t, 'src') ?? '').includes('poster'))
ok(Boolean(poster), 'постер в разметке')
const posterAlt = poster ? attr(poster, 'alt') : ''
ok(
  Boolean(posterAlt) && posterAlt.length > 20,
  'alt постера осмысленный',
  posterAlt ?? '',
)
ok(
  Boolean(posterAlt) &&
    /эвакуатор/i.test(posterAlt) &&
    /петербург/i.test(posterAlt),
  'в alt постера есть услуга и город',
)

/*
 * Имена атрибутов в HTML регистронезависимы, а React пишет их как в JSX —
 * fetchPriority. Ищем без оглядки на регистр, иначе проверка ловит собственную
 * строчную запись, а не то, что реально стоит в файле.
 *
 * Ссылка без href, но с imagesrcset — не поломанная, а штатная отзывчивая форма:
 * там href нужен лишь как запасной адрес для браузеров без srcset. React
 * выпускает свою такую ссылку за каждую картинку, отрисованную на сервере, и
 * рядом с написанной руками получается пара на один и тот же постер. Замер
 * сети показал, что браузер их склеивает: запрос ровно один, и уходит он на
 * 20-й миллисекунде, в нужном размере под ширину экрана. Поэтому здесь
 * проверяется не число ссылок, а то, что среди них есть одна с высоким
 * приоритетом и что каждая куда-то ведёт.
 */
const preloads = (html.match(/<link[^>]*rel="preload"[^>]*>/g) ?? []).filter((t) =>
  /as="image"/.test(t),
)
const targets = preloads.filter((t) => attr(t, 'href') || attr(t, 'imageSrcSet'))
ok(targets.length === preloads.length, 'у всех ссылок preload есть адрес')

const posterPreload = preloads.find((t) =>
  `${attr(t, 'href') ?? ''}${attr(t, 'imageSrcSet') ?? ''}`.includes('poster'),
)
ok(Boolean(posterPreload), 'постер загружается первым')
ok(
  preloads.some(
    (t) =>
      `${attr(t, 'href') ?? ''}${attr(t, 'imageSrcSet') ?? ''}`.includes('poster') &&
      /fetchpriority="high"/i.test(t),
  ),
  'у постера высокий приоритет',
)
// Ничто, кроме постера, не должно лезть вперёд него: элемент LCP один.
const otherHigh = preloads.filter(
  (t) =>
    /fetchpriority="high"/i.test(t) &&
    !`${attr(t, 'href') ?? ''}${attr(t, 'imageSrcSet') ?? ''}`.includes('poster'),
)
ok(otherHigh.length === 0, 'высокий приоритет только у постера', `${otherHigh.length} лишних`)

// Размеры обязаны стоять у всех картинок: без них место под них не занято до
// загрузки, страница дёргается, и это прямо уходит в CLS.
const noSize = imgs.filter(
  (t) => attr(t, 'width') === null || attr(t, 'height') === null,
)
ok(noSize.length === 0, 'у всех картинок заданы размеры', `без размеров: ${noSize.length}`)

console.log('\nтексты:')
// Служебные пометки не должны утечь на страницу: они для владельца, а не для
// человека с сломавшейся машиной.
const leaks = ['TODO', 'ЗАПОЛНИТЬ', 'заглушка', 'Lorem']
for (const w of leaks) {
  ok(!html.includes(w), `нет «${w}» в видимом тексте`)
}

// Обещания, которые бриф запрещает: их нельзя давать, пока владелец не
// подтвердил, а подтвердить сроки приезда он в принципе не может.
//
// «Не крутятся колёса» и «заблокирован руль» отсюда убраны. Они попали в список,
// пока было неизвестно, берут ли такие заявки: манипулятора у машины нет, всё
// затягивается лебёдкой, и обещать погрузку заклинившей машины было нельзя.
// Форма бота показала обратное — этот случай в ней есть, а рядом стоят вопросы
// про привод, нейтраль, ручник и руль, то есть заявку берут и заранее выясняют,
// как её грузить. Запрет держал на сайте молчание о том, что владелец делает.
const forbidden = [
  'фиксированная цена',
  'фиксированную цену',
  'без доплат',
  'гарантируем',
]
for (const w of forbidden) {
  ok(!html.toLowerCase().includes(w), `нет обещания «${w}»`)
}
ok(
  !/приедем за \d+/i.test(html) && !/за \d+ минут/i.test(html),
  'нет обещанного срока приезда',
)

// Прямая ссылка на мини-приложение уводит заявку в никуда.
ok(!html.includes('/webapp/'), 'нет прямой ссылки на мини-приложение')

// --- незакрытые заглушки: не ошибка, но и не «готово» ------------------------

console.log('\nоткрытые заглушки:')
const hasBot = /href="https:\/\/t\.me\//.test(html)
console.log(
  hasBot
    ? '  ok  кнопка в бота ведёт на настоящий адрес'
    : '  !   кнопки в бота нет: TG_BOT в config.ts ещё не заполнен',
)

console.log(bad === 0 ? '\nстатика в норме' : `\nне проходят: ${bad}`)
process.exit(bad === 0 ? 0 : 1)
