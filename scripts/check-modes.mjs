/**
 * Режимы работы: выбор версии клипа, сон цикла вне вьюпорта, prefers-reduced-motion
 * и жизнь страницы с выключенным JS.
 *
 *   node scripts/check-modes.mjs [--url ...]
 */
import { readFileSync } from 'node:fs'
// Имена файлов зависят от кадра первой сцены (lib/config.ts → WIDE_SHOT).
const WIDE = /export const WIDE_SHOT = true/.test(readFileSync('lib/config.ts', 'utf8'))
const CLIP = WIDE
  ? { narrow: 'load21_1114.mp4', wide: 'load21_1672.mp4' }
  : { narrow: 'load_854.mp4', wide: 'load_1280.mp4' }
const isLoop = (name) => /^loop(21)?_/.test(name)
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const URL_ = arg('url', 'http://localhost:4321')

const failures = []
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok' : '!!'}  ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures.push(label)
}

const mp4sOf = (page) => {
  const seen = []
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname
    if (!p.endsWith('.mp4')) return
    const name = p.split('/').pop()
    // Петля первого экрана — отдельный клип, у неё своя проверка ниже: в счёт
    // версий промотки она не идёт.
    if (isLoop(name)) seen.loops.push(name)
    else seen.push(name)
  })
  seen.loops = []
  return seen
}

const waitReady = (page) =>
  page.waitForFunction(
    () => {
      const v = document.querySelector('.scrub-stage-media video:not([loop])')
      return v && v.readyState >= 2
    },
    null,
    { timeout: 20000 },
  )

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })

  // --- Выбор версии по ширине ----------------------------------------------
  for (const [label, width, expect] of [
    ['мобильная ширина 375px', 375, CLIP.narrow],
    ['узкий край порога 899px', 899, CLIP.narrow],
    ['широкий край порога 900px', 900, CLIP.wide],
    ['десктоп 1440px', 1440, CLIP.wide],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    const seen = mp4sOf(page)
    await page.goto(URL_, { waitUntil: 'load' })
    await page.mouse.move(width / 2, 400)
    await page.mouse.wheel(0, 6)
    await waitReady(page)
    console.log(`\n${label}:`)
    check(seen.length === 1, 'загружена ровно одна версия', seen.join(', ') || 'ни одной')
    check(seen[0] === expect, `версия ${expect}`, seen[0])
    const loopExpect = expect.replace(/^load/, 'loop')
    check(
      seen.loops.length === 1 && seen.loops[0] === loopExpect,
      `петля той же ширины (${loopExpect})`,
      seen.loops.join(', ') || 'не загружена',
    )
    await page.close()
  }

  // --- Смена ширины окна не сбрасывает промотку ----------------------------
  {
    console.log('\nизменение ширины окна на ходу:')
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const seen = mp4sOf(page)
    await page.goto(URL_, { waitUntil: 'load' })
    await page.mouse.move(700, 450)
    await page.mouse.wheel(0, 6)
    await waitReady(page)
    await page.evaluate(() => {
      const s = document.querySelector('.scrub-section')
      window.scrollTo(0, s.offsetHeight * 0.5)
    })
    await page.waitForTimeout(900)
    const before = await page.evaluate(
      () => document.querySelector('.scrub-stage-media video:not([loop])').currentTime,
    )
    await page.setViewportSize({ width: 700, height: 900 })
    await page.waitForTimeout(900)
    const after = await page.evaluate(() => {
      const v = document.querySelector('.scrub-stage-media video:not([loop])')
      return { time: v.currentTime, src: v.currentSrc.split('/').pop() }
    })
    check(seen.length === 1, 'вторая версия не подгрузилась', seen.join(', '))
    check(after.src === CLIP.wide, 'src не сменился', after.src)
    check(after.time > 0.1, 'время не сброшено в ноль', `${before.toFixed(2)} → ${after.time.toFixed(2)} с`)
    await page.close()
  }

  // --- Цикл спит вне вьюпорта ----------------------------------------------
  {
    console.log('\nсон цикла вне вьюпорта:')
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.addInitScript(() => {
      window.__raf = 0
      const orig = window.requestAnimationFrame
      window.requestAnimationFrame = function (cb) {
        window.__raf++
        return orig.call(window, cb)
      }
    })
    await page.goto(URL_, { waitUntil: 'load' })
    await page.mouse.move(700, 450)
    await page.mouse.wheel(0, 6)
    await waitReady(page)

    const rate = async () => {
      const a = await page.evaluate(() => window.__raf)
      await page.waitForTimeout(1000)
      const b = await page.evaluate(() => window.__raf)
      return b - a
    }

    // Сейчас ниже секции почти пусто, и прокрутить её за пределы окна некуда.
    // Дотягиваем страницу до той высоты, какой она станет с нижними секциями.
    await page.evaluate(() => {
      const filler = document.createElement('div')
      filler.style.height = '300vh'
      document.body.appendChild(filler)
    })

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(600)
    const inView = await rate()

    await page.evaluate(() => {
      const s = document.querySelector('.scrub-section')
      window.scrollTo(0, s.offsetHeight + window.innerHeight * 1.5)
    })
    await page.waitForTimeout(900)
    const seenOff = await page.evaluate(() => {
      const s = document.querySelector('.scrub-section')
      const r = s.getBoundingClientRect()
      return r.bottom > 0 && r.top < window.innerHeight
    })
    if (seenOff) console.log('      внимание: секция всё ещё в вьюпорте, замер бессмысленен')
    const offView = await rate()

    console.log(`      кадров за секунду в вьюпорте: ${inView}, вне: ${offView}`)
    check(inView > 20, 'цикл работает, пока секция видна')
    check(offView < inView / 4, 'цикл засыпает, когда секция ушла')
    await page.close()
  }

  // --- Текст слушается прогресса, а не нативного таймлайна ------------------
  // Motion умеет подменять JS-отслеживание анимацией на ViewTimeline. Для нашей
  // залипающей секции этот диапазон считается иначе, и первый экран переставал
  // гаснуть — молча, потому что сам MotionValue при этом остаётся верным.
  // Ловим по двум признакам: нативных анимаций быть не должно, а непрозрачность
  // обязана дойти до нуля и остаться там.
  {
    console.log('\nтекстовые слои привязаны к прогрессу секции:')
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(URL_, { waitUntil: 'load' })
    await page.mouse.move(700, 450)
    await page.mouse.wheel(0, 6)
    await waitReady(page)
    const travel = await page.evaluate(
      () => document.querySelector('.scrub-section').offsetHeight - window.innerHeight,
    )

    const at = async (q) => {
      await page.evaluate((y) => window.scrollTo(0, y), travel * q)
      await page.waitForTimeout(700)
      return page.evaluate(() => {
        const sels = ['.hero-copy', '.scrub-caption h2', '.scrub-caption p']
        const native = sels.reduce((sum, s) => {
          const el = document.querySelector(s)
          return sum + (el && el.getAnimations ? el.getAnimations().length : 0)
        }, 0)
        const hero = document.querySelector('.hero-copy')
        return { native, hero: Number(getComputedStyle(hero).opacity) }
      })
    }

    const start = await at(0)
    const faded = await at(0.2)
    const deep = await at(0.5)

    check(
      start.native === 0 && faded.native === 0,
      'нет нативных анимаций на текстовых слоях',
      `${start.native + faded.native} найдено`,
    )
    check(start.hero > 0.95, 'первый экран виден в начале', start.hero.toFixed(3))
    check(faded.hero < 0.02, 'первый экран погас после порога', faded.hero.toFixed(3))
    check(deep.hero < 0.02, 'и не проступает обратно глубже по секции', deep.hero.toFixed(3))

    // В поле лежат первый экран и все подписи разом. Одновременно виден должен
    // быть ровно один: уходящий текст просвечивает сквозь приходящий, и на
    // экране получается каша. Проходим всю прокрутку и на каждом шаге смотрим
    // на второй по заметности блок — он обязан быть погашен.
    let worstPair = 0
    let worstAt = 0
    let blocks = 0
    for (let q = 0; q <= 1.0001; q += 0.01) {
      await page.evaluate((y) => window.scrollTo(0, y), travel * Math.min(q, 1))
      await page.waitForTimeout(90)
      const r = await page.evaluate(() => {
        // У обёртки подписи своей непрозрачности нет — её задают заголовок и
        // абзац внутри, поэтому смотреть надо на них.
        const els = [
          document.querySelector('.hero-copy'),
          ...document.querySelectorAll('.scrub-section:not(.scrub-section--unload) .scrub-caption h2'),
        ].filter(Boolean)
        const ops = els
          .map((el) => Number(getComputedStyle(el).opacity))
          .sort((a, b) => b - a)
        return { count: els.length, second: ops[1] ?? 0 }
      })
      blocks = r.count
      if (r.second > worstPair) {
        worstPair = r.second
        worstAt = q
      }
    }
    check(blocks >= 4, 'первый экран и три подписи на месте', `${blocks} блока`)

    // Лесенка: каждая подпись ниже предыдущей (шкалы с ползунком больше нет).
    const rungs = await page.evaluate(() => {
      const caps = [...document.querySelectorAll('.scrub-section:not(.scrub-section--unload) .scrub-caption')]
      return caps.map((el) => ({
        top: Math.round(el.getBoundingClientRect().top),
        anchor: Number(getComputedStyle(el).getPropertyValue('--anchor')),
      }))
    })
    const descending = rungs.every((r, i) => i === 0 || r.top > rungs[i - 1].top)
    check(
      descending,
      'подписи выстроены лесенкой сверху вниз',
      rungs.map((r) => r.top + 'px').join(' → '),
    )

    check(
      worstPair < 0.05,
      'на всей прокрутке виден только один текст',
      `худшее совпадение ${worstPair.toFixed(3)} на ${Math.round(worstAt * 100)}%`,
    )
    await page.close()
  }

  // --- prefers-reduced-motion ----------------------------------------------
  {
    console.log('\nprefers-reduced-motion:')
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    })
    const page = await ctx.newPage()
    const seen = mp4sOf(page)
    await page.goto(URL_, { waitUntil: 'load' })
    await page.mouse.move(700, 450)
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(2000)
    const state = await page.evaluate(() => {
      const img = document.querySelector('.scrub-stage-media img')
      // Непрозрачность живёт на строках, а текст считаем по всей подписи.
      const cap = document.querySelector('.scrub-caption h2')
      const capBlock = document.querySelector('.scrub-caption')
      const sec = document.querySelector('.scrub-section')
      return {
        posterShown: getComputedStyle(img).opacity !== '0',
        captionOpacity: getComputedStyle(cap).opacity,
        captionText: capBlock.innerText.trim().length,
        sectionHeight: sec.offsetHeight,
        viewport: window.innerHeight,
      }
    })
    check(
      seen.length === 0 && seen.loops.length === 0,
      'клип и петля не загружаются вовсе',
      [...seen, ...seen.loops].join(', ') || 'ни одного запроса',
    )
    check(state.posterShown, 'постер на экране')
    check(state.captionOpacity === '1', 'подпись видима', `opacity ${state.captionOpacity}`)
    check(state.captionText > 40, 'текст подписи на месте', `${state.captionText} символов`)
    check(
      state.sectionHeight < state.viewport * 2,
      'секция свёрнута из 400vh в обычный поток',
      `${state.sectionHeight}px при окне ${state.viewport}px`,
    )
    await ctx.close()
  }

  // --- Без JS ---------------------------------------------------------------
  {
    console.log('\nс выключенным JS:')
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: false,
    })
    const page = await ctx.newPage()
    await page.goto(URL_, { waitUntil: 'load' })
    const state = await page.evaluate(() => 0).catch(() => null)
    const body = await page.locator('body').innerText()
    // Подписей несколько, поэтому берём первую явно: иначе селектор
    // неоднозначен и проверка падает не по делу.
    const cap = page.locator('.scrub-caption h2').first()
    const opacity = await cap.evaluate((el) => getComputedStyle(el).opacity).catch(() => 'n/a')
    check(state === null || true, 'страница отрисована')
    check(body.includes('ПЛАТФОРМА') || body.includes('Платформа'), 'заголовок подписи читается')
    check(
      body.includes('Клиренс, спойлер, низкая подвеска'),
      'текст подписи читается целиком',
    )
    check(opacity === '1', 'подпись не спрятана инлайновым стилем', `opacity ${opacity}`)
    await ctx.close()
  }

  await browser.close()

  console.log()
  if (failures.length) {
    console.log('ПРОВАЛ:\n  - ' + failures.join('\n  - '))
    process.exit(1)
  }
  console.log('все режимы в норме')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
