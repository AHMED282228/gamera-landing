/**
 * Картинка для пересылки ссылки (og:image): public/og-1200.jpg, 1200×630.
 *
 * Когда ссылку пересылают в Telegram, WhatsApp или ВКонтакте, мессенджер
 * показывает эту картинку. Голый постер говорил только «какой-то эвакуатор»;
 * на карточке ещё и что это и куда звонить — номер видно, даже если ссылку
 * не открыли.
 *
 * Кадр — тот же ночной постер, целиком по ширине: кабина с маячком, платформа
 * и BMW остаются на виду. Надписи — в тёмной полосе внизу, над колёсами и
 * асфальтом, где кадру нечего терять. Шрифты и цвета берутся с самой страницы:
 * карточка рисуется поверх собранного сайта, поэтому совпадает с ним.
 *
 *   npm run build && npx serve out -l 4321
 *   node scripts/make-og.mjs [http://localhost:4321]
 */
import { chromium } from 'playwright'

const TARGET = process.argv[2] ?? 'http://localhost:4321'
const OUT = 'public/og-1200.jpg'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(TARGET, { waitUntil: 'networkidle' })
await page.evaluate(async () => {
  const s = getComputedStyle(document.documentElement)
  // Собранный CSS пишет имена шрифтов в двойных кавычках — внутри style="…" они рвут атрибут.
  const v = (n) => s.getPropertyValue(n).trim().replace(/"/g, "'")
  // Номер и название — со страницы (они из lib/config.ts), а не вписаны сюда:
  // сменится номер — карточка после пересборки покажет новый, а не старый.
  const phone = document.querySelector('a[href^="tel:"]').textContent.trim()
  const brand = document.querySelector('.site-brand-text > span').textContent.trim()
  // Постер — тот, что стоит на странице (16:9 или 21:9, lib/config.ts → WIDE_SHOT).
  // У 21:9 по ширине срезается лишнее: 70% — нос кабины с местом перед ним и BMW целиком.
  const poster = document.querySelector('.scrub-frame img').getAttribute('src')
  const card = document.createElement('div')
  card.innerHTML = `
    <div style="position:absolute;inset:0;background:url(${poster}) 70% top/cover no-repeat"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,
      rgb(11 7 15/.55) 0%, rgb(11 7 15/0) 22%, rgb(11 7 15/0) 50%, rgb(11 7 15/.86) 68%, rgb(11 7 15/.96) 100%)"></div>
    <div style="position:absolute;left:64px;top:44px;display:flex;align-items:center;gap:16px">
      <img src="/brand/logo-mark.webp" style="height:56px;width:auto" alt="">
      <div style="display:flex;flex-direction:column;line-height:1">
        <span style="font-family:${v('--font-display')};font-size:34px;letter-spacing:.02em;text-transform:uppercase;color:${v('--color-ink')}">${brand}</span>
        <span style="margin-top:6px;font-family:${v('--font-mono')};font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:${v('--color-ink')}">Помощь на дороге</span>
      </div>
    </div>
    <div style="position:absolute;left:64px;right:64px;bottom:46px">
      <div style="width:72px;height:4px;background:${v('--color-red')}"></div>
      <div style="margin-top:18px;font-family:${v('--font-mono')};font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:${v('--color-amber')}">Круглосуточно · СПб и Ленобласть</div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:32px;margin-top:10px">
        <span style="font-family:${v('--font-display')};font-weight:600;font-size:88px;line-height:.95;letter-spacing:.01em;white-space:nowrap;text-transform:uppercase;color:${v('--color-ink')}">Эвакуатор 24/7</span>
        <span style="font-family:${v('--font-display')};font-size:52px;line-height:1;letter-spacing:.01em;white-space:nowrap;color:#fff">${phone}</span>
      </div>
    </div>`
  card.style.cssText = `position:fixed;left:0;top:0;width:1200px;height:630px;overflow:hidden;z-index:2147483647;background:${v('--color-bg')}`
  document.body.append(card)
  await Promise.all([...card.querySelectorAll('img')].map((i) => i.decode().catch(() => {})))
  const bg = new Image(); bg.src = '/media/poster-1280.jpg'; await bg.decode()
  await document.fonts.ready
})
await page.screenshot({ path: OUT, type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
console.log('записано', OUT)
