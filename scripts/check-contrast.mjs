/**
 * Считает контраст каждой видимой строки на странице по формуле WCAG.
 *
 * Зачем отдельный скрипт: цвета в токенах посчитаны один раз и записаны
 * комментарием, но на странице цвет текста и цвет подложки собираются из разных
 * мест — карточка может стоять на приподнятом фоне, а серебро для рамок легко
 * уехать в подписи. Глазами такое не ловится: --steel-1 на тёмном выглядит
 * нормально, а даёт 3.54 при требуемых 4.5, и заметить это можно только счётом.
 *
 * Порог берётся по WCAG AA: 4.5 обычному тексту и 3.0 крупному — от 24px или
 * от 18.66px жирным.
 *
 * Текст поверх кадра сюда не попадает: там подложка не цвет, а картинка, и её
 * меряет отдельный скрипт check-legibility.mjs — пикселями по готовому кадру.
 *
 *   node scripts/check-contrast.mjs [--url ...]
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')

const SIZES = [
  { name: 'десктоп 1440', width: 1440, height: 900 },
  { name: 'мобильный 390', width: 390, height: 844, mobile: true },
]

const collect = () => {
  const parse = (css) => {
    const m = css.match(/[\d.]+/g)
    if (!m) return null
    const [r, g, b, a = '1'] = m
    return [+r, +g, +b, +a]
  }

  const lum = ([r, g, b]) => {
    const ch = (v) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
  }

  const over = (fg, bg) => {
    const a = fg[3]
    return [
      fg[0] * a + bg[0] * (1 - a),
      fg[1] * a + bg[1] * (1 - a),
      fg[2] * a + bg[2] * (1 - a),
      1,
    ]
  }

  /** Идём вверх по предкам и складываем полупрозрачные подложки. */
  const backdrop = (el) => {
    const stack = []
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c[3] > 0) {
        stack.push(c)
        if (c[3] >= 1) break
      }
    }
    let base = [11, 7, 15, 1] // --bg, если наверху ничего непрозрачного нет
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base)
    return base
  }

  const out = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim()
    if (!text) continue

    const el = node.parentElement
    if (!el || seen.has(el)) continue
    seen.add(el)

    // Текст поверх кадра меряется картинкой, а не цветом подложки.
    if (el.closest('.scrub-frame')) continue

    const st = getComputedStyle(el)
    if (st.visibility === 'hidden' || st.display === 'none') continue

    const box = el.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) continue

    const fg = parse(st.color)
    if (!fg) continue

    // Подписи на компьютере: буквы прозрачные и залиты светом фары
    // (background-clip: text), а под ними клип в окне света. Это текст поверх
    // картинки — его меряет check-legibility.mjs, с цветом букв в свете.
    const clip = st.backgroundClip || st.webkitBackgroundClip
    if (fg[3] === 0 && clip === 'text' && el.closest('.scrub-caption')) continue

    // Мотион гасит уходящие блоки прозрачностью — меряем их в полную силу,
    // иначе каждый снимок ловил бы полурастворённый текст.
    const bg = backdrop(el)
    const flat = over([fg[0], fg[1], fg[2], fg[3]], bg)

    const l1 = lum(flat)
    const l2 = lum(bg)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

    const px = parseFloat(st.fontSize)
    const weight = +st.fontWeight || 400
    const large = px >= 24 || (px >= 18.66 && weight >= 700)

    out.push({
      text: text.slice(0, 46),
      tag: el.tagName.toLowerCase(),
      cls: el.className?.toString?.().slice(0, 40) ?? '',
      color: st.color,
      px: Math.round(px),
      large,
      need: large ? 3 : 4.5,
      ratio: Math.round(ratio * 100) / 100,
    })
  }
  return out
}

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  let bad = 0

  for (const s of SIZES) {
    const ctx = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      isMobile: Boolean(s.mobile),
      hasTouch: Boolean(s.mobile),
    })
    const page = await ctx.newPage()
    await page.goto(URL_, { waitUntil: 'load' })
    await page.waitForTimeout(500)

    const rows = await page.evaluate(collect)
    const fails = rows.filter((r) => r.ratio < r.need)

    console.log(`\n${s.name}: проверено строк ${rows.length}`)
    if (fails.length === 0) {
      const min = rows.reduce((m, r) => Math.min(m, r.ratio), Infinity)
      console.log(`  все проходят, самый слабый ${min}`)
    } else {
      bad += fails.length
      for (const f of fails) {
        console.log(
          `  ✗ ${f.ratio} при ${f.need} — <${f.tag}> ${f.px}px ${f.color}\n      «${f.text}»\n      ${f.cls}`,
        )
      }
    }

    await ctx.close()
  }

  await browser.close()
  console.log(bad === 0 ? '\nконтраст в норме' : `\nне проходят: ${bad}`)
  process.exit(bad === 0 ? 0 : 1)
}

run()
