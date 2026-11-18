/**
 * Очередь загрузки видео: сначала петля первого экрана, потом клип главы
 * «Грузим».
 *
 * Без очереди клип главы (2–4 МБ) и его петля начинали качаться вместе с
 * петлёй первого экрана сразу после загрузки страницы и делили с ней канал,
 * хотя до главы ещё несколько экранов. Замер 8 ноября 2026 (Chrome, имитация
 * связи): петля первого экрана на 4G шла через 1,0–2,8 с после загрузки
 * страницы, на слабом 4G — через 6–16 с, вместо 1–1,5 и 3–7 с в одиночку.
 *
 * HeroLoop отмечает «готово», когда его петля заиграла (или не будет играть
 * вовсе), глава ждёт этой отметки или своего подхода к окну — что раньше.
 */

const EVENT = 'gamera:hero-loop-done'
let done = false

export function markHeroLoopDone() {
  if (done) return
  done = true
  window.dispatchEvent(new Event(EVENT))
}

/** Позовёт cb, когда петля первого экрана готова (сразу, если уже). Возвращает отписку. */
export function onHeroLoopDone(cb: () => void): () => void {
  if (done) {
    cb()
    return () => {}
  }
  window.addEventListener(EVENT, cb, { once: true })
  return () => window.removeEventListener(EVENT, cb)
}

/**
 * То же, но только на хорошей связи. На 3G/2G (так Chrome называет и слабый 4G) и при
 * экономии трафика глава «Грузим» и экран бота качаются лишь при подходе к ним: клип
 * главы с петлёй — до 9,6 МБ, на слабом 4G это 30–60 с занятого канала (замер 14 ноября
 * 2026), а человеку на обочине канал нужен для звонка и Telegram. iPhone связь не
 * сообщает — для него связь считается хорошей, как и в HeroLoop.
 */
export function onHeroLoopDoneIfFast(cb: () => void): () => void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection
  if (conn?.saveData || /(^|-)(2g|3g)$/.test(conn?.effectiveType ?? '')) return () => {}
  return onHeroLoopDone(cb)
}
