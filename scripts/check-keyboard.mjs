/**
 * Проходит страницу с клавиатуры и смотрит, что происходит.
 *
 * Проверяется три вещи, и все три ловятся только настоящим Tab:
 *   — каждый элемент, до которого доходит фокус, получает видимую рамку;
 *   — порядок обхода совпадает с порядком чтения, без прыжков вверх;
 *   — убранная прилипшая панель не участвует в обходе. Она лежит за нижней
 *     кромкой экрана, и если её кнопки остаются в цепочке, человек нажимает
 *     Tab и проваливается фокусом в невидимое.
 *
 *   node scripts/check-keyboard.mjs [--url ...]
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')

let bad = 0
const ok = (cond, label, detail = '') => {
  if (!cond) bad++
  console.log(`  ${cond ? 'ok ' : '✗  '} ${label}${detail ? ` — ${detail}` : ''}`)
}

const focused = () =>
  // eslint-disable-next-line no-undef
  ((el) => {
    if (!el || el === document.body) return null
    const st = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? '').trim().slice(0, 34),
      href: el.getAttribute('href'),
      outlineWidth: parseFloat(st.outlineWidth) || 0,
      outlineStyle: st.outlineStyle,
      outlineColor: st.outlineColor,
      top: Math.round(box.top + window.scrollY),
      visible: box.width > 0 && box.height > 0 && st.visibility !== 'hidden',
    }
  })(document.activeElement)

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })

  for (const vp of [
    { name: 'десктоп 1440', width: 1440, height: 900 },
    { name: 'мобильный 390', width: 390, height: 844, mobile: true },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: Boolean(vp.mobile),
      hasTouch: Boolean(vp.mobile),
    })
    const page = await ctx.newPage()
    await page.goto(URL_, { waitUntil: 'load' })
    await page.waitForTimeout(500)

    console.log(`\n${vp.name}, обход сверху:`)

    const stops = []
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      const f = await page.evaluate(focused)
      if (!f) break
      if (stops.length && stops.at(-1).text === f.text && stops.at(-1).top === f.top) break
      stops.push(f)
    }

    ok(stops.length > 0, 'фокус вообще ходит по странице', `${stops.length} остановок`)

    const noRing = stops.filter((s) => s.outlineWidth < 1 || s.outlineStyle === 'none')
    ok(noRing.length === 0, 'у всех остановок видимая рамка фокуса',
      noRing.map((s) => `${s.tag}«${s.text}»`).join(', '))

    /*
     * Цвет рамки снимается сразу после нажатия, а не через паузу, и это важно.
     * Утилита transition-colors из Tailwind держит в своём списке outline-color,
     * и с ней рамка 200 мс переползала из цвета текста в янтарный: на красной
     * кнопке она была белой, на телефоне серебристой. Замер с задержкой этого
     * не увидел бы — к его моменту цвет уже доехал.
     */
    const AMBER = 'rgb(255, 178, 30)'
    /* На красном финальном блоке рамка белая: янтарь на красном не виден. */
    const WHITE = 'rgb(255, 255, 255)'
    const wrongColor = stops.filter((s) => s.outlineColor !== AMBER && s.outlineColor !== WHITE)
    ok(wrongColor.length === 0, 'рамка янтарная сразу, без перехода',
      wrongColor.map((s) => `${s.outlineColor} у «${s.text}»`).join(', '))

    const hidden = stops.filter((s) => !s.visible)
    ok(hidden.length === 0, 'фокус не уходит на невидимое',
      hidden.map((s) => `${s.tag}«${s.text}»`).join(', '))

    // Первая же остановка должна быть в шапке: до неё ничего нет.
    ok(
      stops.length > 0 && stops[0].top < 200,
      'обход начинается сверху страницы',
      stops.length ? `первая на ${stops[0].top}px` : '',
    )

    // Порядок обхода не должен возвращаться вверх больше чем на экран:
    // такой прыжок означает, что что-то вырвано из потока.
    const jumps = stops
      .map((s, i) => (i ? stops[i - 1].top - s.top : 0))
      .filter((d) => d > vp.height)
    ok(jumps.length === 0, 'порядок обхода идёт сверху вниз', `прыжков назад: ${jumps.length}`)

    // Телефон должен попадаться до конца страницы, а не только в подвале.
    const firstTel = stops.findIndex((s) => (s.href ?? '').startsWith('tel:'))
    ok(firstTel >= 0 && firstTel <= 2, 'до телефона доходит за пару нажатий',
      firstTel < 0 ? 'не найден' : `${firstTel + 1}-я остановка`)

    for (const s of stops.slice(0, 8)) {
      console.log(
        `        ${s.tag.padEnd(6)} y=${String(s.top).padStart(5)}  ` +
          `рамка ${s.outlineWidth}px ${s.outlineColor}  «${s.text}»`,
      )
    }

    await ctx.close()
  }

  await browser.close()
  console.log(bad === 0 ? '\nклавиатура в норме' : `\nне проходят: ${bad}`)
  process.exit(bad === 0 ? 0 : 1)
}

run()
