'use client'

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

import {
  BOT_NAME,
  BTN_CALL,
  BTN_CANCEL,
  BTN_ORDERS,
  CONFIRMED,
  FORM_DEMO,
  GREETING,
  ORDER_NO,
  RATE_INVITE,
  STATUS_MSGS,
  TIMES,
} from '@/lib/botDemo'
import { BOT_IMAGES, DEMO_MAP } from '@/lib/config'

/**
 * Аватар и фото приветствия бота — логотип на чёрном, как в самом боте.
 * Пути — через lib/config (приставка подкаталога для витрины GitHub Pages).
 */
const AVATAR = BOT_IMAGES.avatar
const HELLO_PHOTO = BOT_IMAGES.hello

/**
 * Заказ через бота на экране iPhone: чат Telegram (тёмная тема iOS) и
 * мини-приложение с настоящей формой заявки. Что на экране, задаёт место на
 * общей шкале (этап scene, шаг tick, доля шага sub — playAt ниже); OrderDemo
 * ведёт это место за прокруткой, как клип в главе «Грузим»: остановили
 * прокрутку — всё стоит, отмотали — идёт назад.
 */

/**
 * Вес шагов каждого этапа — сколько прокрутки получает шаг (OrderDemo:
 * PER_SEC высот окна на единицу). Показ идёт только за прокруткой, как клип в
 * «Грузим»: остановились — всё стоит. Касания и печать — быстрые; а шаг,
 * который даёт заметный результат («/start», приветствие, открылась форма,
 * номер подставился, «Заявка принята», номер в чате, статусы), весит больше:
 * результат появляется в начале шага и стоит остаток — его успевают увидеть
 * и при обычном листании (владелец: «/start видно на долю секунды»).
 * Внутри шага доли (касание с 0.25, печать 0.14…0.72 и т. п.) те же.
 *
 * 0 «Откройте бота» — первый вход глазами нового клиента, как на записи
 *   экрана владельца (obrazcy-telegram/pervyj-vhod.mp4, 15 ноября 2026):
 *   0 пустой чат — «Сообщений пока нет...», над синей кнопкой «Старт»
 *     подсказка «Чтобы использовать бота, нажмите здесь» (описания бота в
 *     BotFather нет, поэтому плашки «Что умеет этот бот?» тоже нет);
 *   1 касание «Старт» — кнопка темнеет;
 *   2 кнопка сжимается в «Меню», выезжает строка ввода, в чате «/start»;
 *   3 приходит приветствие с эмблемой и кнопками;
 *   4 «Вызвать эвакуатор» мягко пульсирует (нажатие — уже первый шаг
 *     следующего этапа: касание и сразу результат).
 * 1 «Заполните форму»: касание «Вызвать эвакуатор» → форма → имя → телефон
 *   → «Определить» и карта → подтверждение → «Куда» с подсказками → машина →
 *   неисправность → условия → согласие → форма у кнопки (пульсирует).
 * 2 «Заявка у водителя»: касание «Вызвать эвакуатор» → «Отправляем…» →
 *   «Заявка принята» → «Готово» → в чате номер заявки → «принята в работу».
 * 3 «Едем к вам»: «Водитель выехал». 4 «Довезли»: «выполнена» → оценка → 5 ⭐.
 */
const DUR: readonly (readonly number[])[] = [
  [1.0, 0.8, 1.4, 1.5, 0.6],
  [0.8, 1.1, 1.1, 1.2, 3.0, 0.9, 2.8, 0.9, 0.8, 2.0, 1.0, 0.6],
  [0.7, 0.8, 1.4, 0.7, 1.2, 1.2],
  [0.6, 1.4],
  [0.5, 1.2, 1.1, 1.2],
]

/** Вес каждого этапа целиком. */
export const STAGE_TIME = DUR.map((d) => d.reduce((a, b) => a + b, 0))

/**
 * Доли показа — законченные действия, на которых можно остановиться: после
 * каких шагов этапа доля кончается. Этап 0: «Старт» и /start; приветствие.
 * Этап 1: форма открылась; имя и телефон; точка на карте; точка
 * подтверждена; «Куда» с подсказками; машина и неисправность; условия
 * погрузки; согласие и кнопка. Этап 2: отправка; «Заявка принята» и
 * «Готово»; номер в чате; «принята в работу». Этап 3: «Водитель выехал».
 * Этап 4: «выполнена»; оценка. OrderDemo доводит начатую долю до конца,
 * когда посетитель перестал листать.
 */
const BEAT_ENDS: readonly (readonly number[])[] = [[2, 4], [1, 3, 4, 5, 6, 8, 9, 11], [1, 3, 4, 5], [1], [1, 3]]
/** Конец каждой доли — вес от начала этапа. */
export const BEATS = BEAT_ENDS.map((ends, s) => ends.map((k) => DUR[s].slice(0, k + 1).reduce((a, b) => a + b, 0)))

/** Время в строке состояния на каждом этапе. */
const CLOCK = ['23:41', '23:42', '23:43', '23:52', '00:47'] as const

/** sub — доля пройденного внутри текущего шага (0…1): по ней печатаются буквы, ставится касание. */
export type ScenePos = { s: number; t: number; sub: number }

/** Что на экране на месте time от начала этапа s (без округления). time = Infinity — этап доигран. */
export function playAtExact(s: number, time: number): ScenePos {
  const d = DUR[s]
  if (time >= STAGE_TIME[s]) return { s, t: d.length - 1, sub: 1 }
  let t = 0
  let acc = 0
  while (t < d.length - 1 && time >= acc + d[t]) acc += d[t++]
  return { s, t, sub: Math.min(1, Math.max(0, (time - acc) / d[t])) }
}

/**
 * То же с долей шага ступеньками по 1/32: буквы печатаются плавно, а React не
 * перерисовывает телефон на каждом кадре. Плавное (карта) читает точное
 * место из exact — без перерисовки.
 */
export function playAt(s: number, time: number): ScenePos {
  const p = playAtExact(s, time)
  return { ...p, sub: Math.round(p.sub * 32) / 32 }
}

type Props = {
  /** Этап 0…4, мелкий шаг внутри него и доля шага — из playAt. */
  scene: number
  tick: number
  sub: number
  /** Точное место (playAtExact) на каждом кадре — для приближения карты. */
  exact?: RefObject<ScenePos>
}

export function TgDemo({ scene, tick, sub, exact }: Props) {
  const at = (s: number, t = 0) => scene > s || (scene === s && tick >= t)
  const now = (s: number, t: number) => scene === s && tick === t
  /** Касание на шаге t этапа s, начиная с доли from: сначала видно, куда нажмут. */
  const tapAt = (s: number, t: number, from = 0.35) => now(s, t) && sub >= from

  // Форма открыта с касания «Вызвать эвакуатор» в чате до «Готово» на экране успеха.
  const sheetOpen = at(1, 1) && !at(2, 4)
  const success = at(2, 2)
  // Новый чат: «Старт» ещё не нажали — внизу кнопка вместо строки ввода.
  const fresh = !at(0, 2)
  const pressStart = now(0, 1) && sub >= 0.3

  // Куда прокручена форма внутри мини-приложения.
  let formAt: FormSection = 'top'
  if (scene === 1) {
    if (tick >= 10) formAt = 'end'
    else if (tick >= 9) formAt = 'cond'
    else if (tick >= 7) formAt = 'car'
    else if (tick >= 6) formAt = 'to'
    else if (tick >= 4) formAt = 'route'
  } else if (scene > 1) formAt = 'end'

  return (
    <div className={`tg${sheetOpen ? ' tg--sheet' : ''}${fresh ? ' tg--fresh' : ''}`} data-scene={scene} data-tick={tick}>
      <StatusBar time={CLOCK[scene]} />

      <div className="tg-chat">
        <div className="tg-nav">
          <span className="tg-glass tg-round tg-back">
            <svg viewBox="0 0 12 20" width="12" height="20"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="tg-badge">26</span>
          </span>
          <span className="tg-glass tg-title">
            <b>{BOT_NAME}</b>
            <small>бот</small>
          </span>
          <span className="tg-ava">
            <img src={AVATAR} width={132} height={132} alt="" decoding="async" />
          </span>
        </div>

        {/* Пустой чат: плашка посередине, как в Telegram, пока нет ни одного сообщения. */}
        <span className="tg-empty">Сообщений пока нет...</span>

        <div className="tg-feed">
          {!fresh && <span className="tg-date">Сегодня</span>}

          {!fresh && <Bubble out time={TIMES[0]}>/start</Bubble>}

          {at(0, 3) && (
            <Group
              keys={[[BTN_CALL], [BTN_ORDERS]]}
              tap={tapAt(1, 0, 0.25) && sub < 0.85 ? BTN_CALL : undefined}
              hint={scene === 0 && tick >= 4 ? BTN_CALL : undefined}
              appKey={BTN_CALL}
              share
            >
              <Bubble time={TIMES[1]} kb photo={HELLO_PHOTO}>
                <b>{GREETING.bold}</b>
                <br />
                {GREETING.lines[0]}
                <br />
                <br />
                {GREETING.lines[1]}
                <br />
                <br />
                <i>{GREETING.italic}</i>
              </Bubble>
            </Group>
          )}

          {at(2, 4) && (
            <Group keys={[[BTN_CANCEL]]}>
              <Bubble time={TIMES[2]} kb>
                {CONFIRMED.head[0]}
                <b>{CONFIRMED.head[1]}</b>
                {CONFIRMED.head[2]}
                <br />
                Статус: <b>{CONFIRMED.status}</b>
                <br />
                <br />
                {CONFIRMED.text}
                <br />
                <br />
                {CONFIRMED.cancel}
              </Bubble>
            </Group>
          )}

          {at(2, 5) && <StatusBubble msg={STATUS_MSGS.accepted} time={TIMES[3]} />}
          {at(3, 1) && <StatusBubble msg={STATUS_MSGS.enRoute} time={TIMES[4]} />}
          {at(4, 1) && <StatusBubble msg={STATUS_MSGS.done} time={TIMES[5]} />}

          {at(4, 2) && (
            <Group
              keys={[['1 ⭐', '2 ⭐', '3 ⭐', '4 ⭐', '5 ⭐']]}
              tap={tapAt(4, 3, 0.25) && sub < 0.62 ? '5 ⭐' : undefined}
              picked={at(4, 3) && sub >= 0.6 ? '5 ⭐' : undefined}
            >
              <Bubble time={TIMES[6]} kb>
                {RATE_INVITE[0]}
                <br />
                {RATE_INVITE[1]}
              </Bubble>
            </Group>
          )}
        </div>

        <div className="tg-input">
          <span className="tg-menu">
            <svg viewBox="0 0 16 12" width="15" height="12"><path d="M1 1h14M1 6h14M1 11h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            Меню
          </span>
          <span className="tg-glass tg-round">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="m20.5 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="tg-glass tg-field">
            Сообщение
            <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 3a9 9 0 0 0 9 9h-5a4 4 0 0 1-4-4Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
          </span>
          <span className="tg-glass tg-round">
            <svg viewBox="0 0 24 24" width="22" height="22"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </span>
        </div>

        {/*
          Новый чат с ботом: вместо строки ввода — «Старт» с подсказкой над ней
          (размеры и цвета — по записи экрана iPhone владельца). После касания
          кнопка сжимается в «Меню», и выезжает обычная строка ввода.
        */}
        <div className="tg-start" aria-hidden="true">
          <span className="tg-tip">
            <svg viewBox="0 0 16 16" width="16" height="16"><path d="m3 3.5 5 4.5 5-4.5M3 8.5 8 13l5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Чтобы использовать бота, нажмите здесь
          </span>
          <span className={`tg-start__btn${pressStart ? ' is-press' : ''}`}>
            <span className="tg-start__label">Старт</span>
            {pressStart && sub < 0.92 && <Touch />}
          </span>
        </div>
      </div>

      <div className={`tma-sheet${sheetOpen ? ' is-open' : ''}`}>
        <span className="tma-grabber" />
        <div className="tma-head">
          <span className="tma-hbtn">
            <svg viewBox="0 0 14 14" width="13" height="13"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
          <span className="tma-htitle">
            <b>{BOT_NAME}</b>
            <small>мини-приложение</small>
          </span>
          <span className="tma-hbtn">
            <svg viewBox="0 0 18 4" width="17" height="4"><circle cx="2" cy="2" r="2" fill="currentColor" /><circle cx="9" cy="2" r="2" fill="currentColor" /><circle cx="16" cy="2" r="2" fill="currentColor" /></svg>
          </span>
        </div>
        <div className="tma-body">
          {success ? (
            <SuccessScreen tapDone={tapAt(2, 3, 0.25)} />
          ) : (
            <OrderForm at={at} now={now} sub={sub} section={formAt} exact={exact} />
          )}
        </div>
      </div>

      <span className="tg-home" />
    </div>
  )
}

/* --- Чат ------------------------------------------------------------------- */

function StatusBar({ time }: { time: string }) {
  return (
    <div className="tg-status">
      <span className="tg-clock">{time}</span>
      <span className="tg-icons">
        <svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg viewBox="0 0 16 12" width="16" height="12"><path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8 .3 10.6 10.6 0 0 0 .5 3.4l1.3 1.3A8.7 8.7 0 0 1 8 2.2Zm0 3.7c1.4 0 2.6.5 3.6 1.4l1.3-1.3A7 7 0 0 0 8 4a7 7 0 0 0-4.9 2l1.3 1.3c1-.9 2.2-1.4 3.6-1.4Zm0 3.6c-.5 0-1 .2-1.4.6L8 11.5l1.4-1.4c-.4-.4-.9-.6-1.4-.6Z" /></svg>
        <span className="tg-battery"><span /></span>
      </span>
    </div>
  )
}

function Bubble({
  children,
  time,
  out,
  kb,
  photo,
}: {
  children: ReactNode
  time: string
  out?: boolean
  /** Под пузырём клавиатура — нижние углы скруглены одинаково. */
  kb?: boolean
  /** Фото над подписью (приветствие бота приходит картинкой с текстом). */
  photo?: string
}) {
  return (
    <div className={`tg-msg ${out ? 'tg-msg--out' : 'tg-msg--in'}${kb ? ' tg-msg--kb' : ''}${photo ? ' tg-msg--photo' : ''}`}>
      {photo && <img src={photo} width={600} height={600} alt="" className="tg-photo" decoding="async" />}
      {children}
      <span className="tg-time">
        {time}
        {out && (
          <svg viewBox="0 0 18 10" width="17" height="10"><path d="m1 5.5 3 3 6-7M7.5 8.5l1 0 6-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </span>
    </div>
  )
}

/** Пузырь бота с клавиатурой под ним: ширина клавиатуры = ширина пузыря. */
function Group({
  children,
  keys,
  tap,
  appKey,
  share,
  picked,
  hint,
}: {
  children: ReactNode
  keys: readonly (readonly string[])[]
  tap?: string
  /** Кнопка, которую сейчас нажмут: мягко пульсирует, пока этап ждёт. */
  hint?: string
  /** Кнопка, которую уже нажали (оценка): остаётся подсвеченной. */
  picked?: string
  /** Кнопка, открывающая мини-приложение: у неё значок в углу. */
  appKey?: string
  /** Круглая кнопка «переслать» справа от пузыря, как у сообщений бота. */
  share?: boolean
}) {
  return (
    <div className="tg-group">
      <div className="tg-group__msg">
        {children}
        {share && (
          <span className="tg-share">
            <svg viewBox="0 0 20 16" width="17" height="14"><path d="M11 1v4C4 5.5 1.5 9.5 1 15c2.2-3.3 5.2-4.8 10-4.8V15l8-7Z" fill="currentColor" /></svg>
          </span>
        )}
      </div>
      <div className="tg-kb">
        {keys.map((row, i) => (
          <div key={i} className="tg-kb__row">
            {row.map((k) => (
              <span key={k} className={`tg-key${tap === k ? ' is-tap' : ''}${picked === k ? ' is-picked' : ''}${hint === k && tap !== k ? ' is-hint' : ''}`}>
                {k}
                {appKey === k && <i className="tg-key__app" />}
                {tap === k && <Touch />}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBubble({ msg, time }: { msg: readonly [string, string, string]; time: string }) {
  return (
    <Bubble time={time}>
      {msg[0]}
      <b>{ORDER_NO}</b>
      {msg[1]}
      <br />
      {msg[2]}
    </Bubble>
  )
}

/* --- Мини-приложение -------------------------------------------------------- */

type FormSection = 'top' | 'route' | 'to' | 'car' | 'cond' | 'end'
type At = (s: number, t?: number) => boolean
type Now = (s: number, t: number) => boolean

/** Касание пальца — круг, как на записи экрана iPhone: видно, что именно нажимают. */
function Touch() {
  return <i className="tg-touch" aria-hidden="true" />
}

/*
 * Шаги этапа «Заполните форму» (scene 1), длительность каждого — DUR[1]:
 *  0 касание «Вызвать эвакуатор» в чате (форма ещё закрыта)
 *  1 открылась форма
 *  2 имя печатается по буквам
 *  3 касание «Из Telegram» → номер появился (подсвечен)
 *  4 форма едет к «Маршруту», касание «Определить…» → карта плавно
 *    приближается (как щипком), метка падает, адрес подставился (подсвечен)
 *  5 касание «Подтвердить точку» → «подтверждена»
 *  6 «Куда отвезти»: печать, выпадают подсказки адресов (как в боте),
 *    касание первой — адрес встал в поле
 *  7 форма едет к «Автомобилю», касание «Легковой»
 *  8 касание «Не заводится»
 *  9 форма едет к условиям погрузки, ответы отмечаются по одному
 * 10 форма у конца, касание «согласен»
 * 11 форма ждёт у кнопки «Вызвать эвакуатор» — кнопка мягко пульсирует
 * Касание кнопки и «Отправляем…» — начало этапа 2 (scene 2, шаги 0–1).
 * Везде: сначала видно, куда нажмут, потом касание, потом результат.
 */
function OrderForm({
  at,
  now,
  sub,
  section,
  exact,
}: {
  at: At
  now: Now
  sub: number
  section: FormSection
  exact?: RefObject<ScenePos>
}) {
  const viewRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Partial<Record<FormSection, HTMLElement | null>>>({})
  const [y, setY] = useState(0)

  // Прокрутка формы к нужной карточке: замер по разметке, без чисел вручную.
  useLayoutEffect(() => {
    const view = viewRef.current
    const content = scrollRef.current
    if (!view || !content) return
    const max = Math.max(0, content.offsetHeight - view.offsetHeight)
    let target = 0
    if (section === 'end') target = max
    else if (section !== 'top') {
      // Сумма offsetTop до самой ленты формы (поле «Куда» сидит внутри карточки).
      let el: HTMLElement | null = refs.current[section] ?? null
      while (el && el !== content) {
        target += el.offsetTop
        el = el.offsetParent as HTMLElement | null
      }
      target -= 10
    }
    setY(Math.min(max, Math.max(0, target)))
  }, [section])

  /** Шаг t пройден или идёт его часть после доли after. */
  const done = (t: number, after: number) => at(1, t + 1) || (now(1, t) && sub >= after)
  /** Касание на шаге t: от доли from до доли to. */
  const tapping = (t: number, from: number, to = 1) => now(1, t) && sub >= from && sub < to

  const filled = (v: boolean, value: string, placeholder: string, fresh = false) => (
    <span className={`tma-input${v ? ' is-filled' : ''}${v && fresh ? ' is-new' : ''}`}>{v ? value : placeholder}</span>
  )
  /**
   * Поле на своём шаге t: касание по полю (до 0.14), курсор, печать по буквам
   * (0.14…0.72); после шага стоит целиком.
   */
  const typed = (t: number, value: string, placeholder: string) => {
    if (at(1, t + 1)) return filled(true, value, placeholder)
    if (!now(1, t)) return filled(false, value, placeholder)
    const n = Math.round(value.length * Math.min(1, Math.max(0, (sub - 0.14) / 0.58)))
    return (
      <span className="tma-input is-filled is-typing">
        {value.slice(0, n)}
        <i className="tma-caret" />
        {sub < 0.14 && <Touch />}
      </span>
    )
  }
  const chips = (options: readonly string[], pick: string, t: number, from: number) => (
    <span className="tma-chips">
      {options.map((v) => {
        const tap = v === pick && tapping(t, from, from + 0.35)
        const on = v === pick && done(t, from + 0.12)
        return (
          <span key={v} className={[on && 'is-on', tap && 'is-tap'].filter(Boolean).join(' ') || undefined}>
            {v}
            {tap && <Touch />}
          </span>
        )
      })}
    </span>
  )
  /** Условия погрузки: пять строк отмечаются по очереди за шаг 9 (после того как форма доехала). */
  const seg = (row: number, options: string[], pick: string) => {
    const from = 0.28 + row * 0.13
    const on = at(1, 10) || (now(1, 9) && sub >= from + 0.05)
    const tap = tapping(9, from, from + 0.13)
    return (
      <span className="tma-seg">
        {options.map((o) => (
          <span key={o} className={o === pick ? [on && 'is-on', tap && 'is-tap'].filter(Boolean).join(' ') || undefined : undefined}>
            {o}
            {o === pick && tap && <Touch />}
          </span>
        ))}
      </span>
    )
  }

  const phoneIn = done(3, 0.55)
  // Форма сначала доезжает до «Маршрута» (~0,6 с), потом касание «Определить»
  // 0.24–0.34, с 0.35 карта приближается (MapTile, 1,5 с), метка падает, затем
  // обратный геокодер вписывает адрес — как в боте.
  const located = done(4, 0.35)
  const addressIn = done(4, 0.86)
  const confirmed = done(5, 0.6)
  const tapSubmit = now(2, 0) && sub >= 0.25 && sub < 0.85
  const sending = at(2, 1)

  return (
    <div ref={viewRef} className="tma-view">
      <div ref={scrollRef} className="tma-scroll" style={{ transform: `translateY(${-y}px)` }}>
        <header className="tma-header">
          <div className="tma-logo">
            G<span>.</span>AMERA
          </div>
          <div className="tma-sub">Эвакуатор · Санкт-Петербург и Ленобласть</div>
        </header>

        <section className="tma-card">
          <h4 className="tma-card-title">Контакты</h4>
          <div className="tma-field">
            <span className="tma-label">Ваше имя</span>
            {typed(2, FORM_DEMO.name, 'Как к вам обращаться')}
          </div>
          <div className="tma-field">
            <span className="tma-label">Телефон</span>
            <span className="tma-row">
              {filled(phoneIn, FORM_DEMO.phone, '+7 (9__) ___-__-__', now(1, 3))}
              <span className={`tma-btn2${tapping(3, 0.2, 0.55) ? ' is-tap' : ''}`}>
                📱 Из Telegram
                {tapping(3, 0.2, 0.55) && <Touch />}
              </span>
            </span>
          </div>
        </section>

        <section className="tma-card" ref={(el) => { refs.current.route = el }}>
          <h4 className="tma-card-title">Маршрут</h4>
          <div className="tma-field">
            <span className="tma-label">Откуда забрать</span>
            <MapTile located={located} live={now(1, 4)} exact={exact} />
            <span className="tma-hint">Тапните по карте или перетащите метку — GPS в области бывает неточным, проверьте точку глазами.</span>
            <span className={`tma-btn2 tma-geo${tapping(4, 0.24, 0.36) ? ' is-tap' : ''}`}>
              📍 Определить моё местоположение
              {tapping(4, 0.24, 0.36) && <Touch />}
            </span>
            {filled(addressIn, FORM_DEMO.from, 'Адрес или ориентир (шоссе, км, съезд)', now(1, 4))}
            <span className={`tma-confirm${confirmed ? ' is-ok' : ''}${tapping(5, 0.25, 0.6) ? ' is-tap' : ''}`}>
              {confirmed ? 'Точка «Откуда» подтверждена' : '✓ Подтвердить точку «Откуда»'}
              {tapping(5, 0.25, 0.6) && <Touch />}
            </span>
          </div>
          <div className="tma-field" ref={(el) => { refs.current.to = el }}>
            <span className="tma-label">Куда отвезти</span>
            <AddressTyping at={at} now={now} sub={sub} />
          </div>
        </section>

        <section className="tma-card" ref={(el) => { refs.current.car = el }}>
          <h4 className="tma-card-title">Автомобиль</h4>
          <div className="tma-field">
            <span className="tma-label">Тип транспорта</span>
            {chips(FORM_DEMO.vehicles, FORM_DEMO.vehicle, 7, 0.52)}
          </div>
          <div className="tma-field">
            <span className="tma-label">Что случилось</span>
            {chips(FORM_DEMO.reasons, FORM_DEMO.reason, 8, 0.25)}
          </div>
        </section>

        <section className="tma-card" ref={(el) => { refs.current.cond = el }}>
          <h4 className="tma-card-title">Условия погрузки</h4>
          <p className="tma-card-hint">От этого зависит, каким способом водитель погрузит автомобиль.</p>
          <div className="tma-field"><span className="tma-label">Колёса крутятся?</span>{seg(0, ['Да', 'Нет'], 'Да')}</div>
          <div className="tma-field"><span className="tma-label">Руль разблокирован?</span>{seg(1, ['Да', 'Нет'], 'Да')}</div>
          <div className="tma-field"><span className="tma-label">Привод</span>{seg(2, ['Полный', 'Задний', 'Передний'], 'Передний')}</div>
          <div className="tma-field"><span className="tma-label">Стоит на ручнике или в передаче?</span>{seg(3, ['Да', 'Нет'], 'Да')}</div>
          <div className="tma-field"><span className="tma-label">Можно ли поставить на нейтраль?</span>{seg(4, ['Да', 'Нет'], 'Да')}</div>
        </section>

        <section className="tma-card">
          <div className="tma-field">
            <span className="tma-label">Комментарий <em>(необязательно)</em></span>
            <span className="tma-input tma-area">Например: машина в паркинге, низкий потолок</span>
          </div>
          <span className="tma-consent">
            <span className={`tma-check${done(10, 0.68) ? ' is-on' : ''}${tapping(10, 0.52, 0.82) ? ' is-tap' : ''}`}>
              {tapping(10, 0.52, 0.82) && <Touch />}
            </span>
            <span>
              Я согласен(на) на обработку персональных данных в соответствии с <u>политикой конфиденциальности</u>
            </span>
          </span>
        </section>

        {/* Как в боте (app.js): по нажатию кнопка тускнеет и пишет «Отправляем…». */}
        <span className={`tma-primary${tapSubmit ? ' is-tap' : ''}${sending ? ' is-sending' : ''}${now(1, 11) ? ' is-hint' : ''}`}>
          {sending ? 'Отправляем…' : '🚨 Вызвать эвакуатор'}
          {tapSubmit && <Touch />}
        </span>
        <footer className="tma-footer">G.AMERA · Санкт-Петербург и Ленинградская область</footer>
      </div>
    </div>
  )
}

/**
 * «Куда отвезти» с подсказками, как в боте (app.js attachSuggest): с третьей
 * буквы и паузы 350 мс под полем выпадает список Dadata (только СПб и ЛО, без
 * региона в строке), по касанию строка встаёт в поле. Дома в списке — те, что
 * есть на Софийской улице по OpenStreetMap (6, 60, 62 к2, 66).
 * Доли шага 6 (3,8 с): форма доезжает до поля, касание по полю 0.16–0.24,
 * печать 0.24–0.5, первые подсказки с 0.34, полные с 0.56, касание первой
 * 0.68–0.84, адрес в поле с 0.84.
 */
function AddressTyping({ at, now, sub }: { at: At; now: Now; sub: number }) {
  const { to, toQuery, toSuggest } = FORM_DEMO
  if (at(1, 7)) return <span className="tma-input is-filled">{to}</span>
  if (!now(1, 6) || sub < 0.16) return <span className="tma-input">Адрес назначения (СТО, стоянка, дом)</span>
  if (sub >= 0.84) return <span className="tma-input is-filled is-new">{to}</span>
  const n = Math.round(toQuery.length * Math.min(1, Math.max(0, (sub - 0.24) / 0.26)))
  const list = sub >= 0.56 ? toSuggest.full : sub >= 0.34 ? toSuggest.partial : null
  const tap = sub >= 0.68
  return (
    <span className="tma-suggest-wrap">
      <span className="tma-input is-filled is-typing">
        {toQuery.slice(0, n)}
        <i className="tma-caret" />
        {sub < 0.24 && <Touch />}
      </span>
      {list && (
        <span key={list === toSuggest.full ? 'full' : 'partial'} className="tma-suggest">
          {list.map((v, i) => (
            <span key={v} className={i === 0 && tap ? 'is-active' : undefined}>
              {v}
              {i === 0 && tap && <Touch />}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

function SuccessScreen({ tapDone }: { tapDone: boolean }) {
  return (
    <div className="tma-view">
      <div className="tma-scroll">
        <header className="tma-header">
          <div className="tma-logo">
            G<span>.</span>AMERA
          </div>
          <div className="tma-sub">Эвакуатор · Санкт-Петербург и Ленобласть</div>
        </header>
        <div className="tma-card tma-success">
          <div className="tma-success-icon">✅</div>
          <h4 className="tma-success-title">Заявка принята</h4>
          <div className="tma-order-no">{ORDER_NO}</div>
          <p className="tma-success-text">
            Статус: <b>Новая</b>. Мы свяжемся с вами в ближайшее время — следите за уведомлениями в чате с ботом.
          </p>
          <span className={`tma-primary${tapDone ? ' is-tap' : ''}`}>Готово</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Карта выбора точки — как в мини-приложении бота: светлые тайлы
 * OpenStreetMap, приглушённые тем же фильтром (brightness .72, contrast 1.06,
 * saturate .55). Пока точку не определили — весь город (масштаб 9, так бот
 * открывает карту); по «Определить местоположение» карта приближается к
 * точке до масштаба 16.
 *
 * Приближение — как щипок пальцами (владелец, 15 ноября 2026: смена двух
 * картинок выглядела ненастояще): масштаб растёт плавно, с разгоном и
 * торможением; текущий снимок увеличивается, а следующий, более подробный,
 * проявляется поверх, когда масштаб доходит до его уровня, — так подгружает
 * тайлы сама карта (Leaflet). Точка у всех снимков ровно в центре, поэтому
 * карта не съезжает. Кадры ставятся прямо в стиль, без перерисовки React.
 *
 * live — точку определяют сейчас (идёт шаг 4 формы): приближение идёт за
 * прокруткой — масштаб берётся из точного места шага (exact, доли 0.35…0.8),
 * а не из своих часов: остановили прокрутку — карта стоит, отмотали —
 * отдаляется. Иначе — весь город или уже точка.
 */
const ZOOM_FROM = 0.35
const ZOOM_TO = 0.8
/** За какую долю уровня следующий снимок проявляется поверх предыдущего. */
const ZOOM_FADE = 0.45

function MapTile({ located, live, exact }: { located: boolean; live: boolean; exact?: RefObject<ScenePos> }) {
  const layers = useRef<(HTMLImageElement | null)[]>([])

  useLayoutEffect(() => {
    if (!DEMO_MAP) return
    const els = layers.current
    const top = DEMO_MAP.levels.length - 1
    /** z — непрерывный масштаб: 0 — весь город, top — точка. */
    const draw = (z: number) => {
      const k = Math.min(top, Math.floor(z))
      const f = z - k
      els.forEach((el, i) => {
        if (!el) return
        let op = 0
        let sc = 1
        if (i === k) {
          op = k === 0 ? 1 : Math.min(1, f / ZOOM_FADE)
          sc = 2 ** f
        } else if (i === k - 1 && f < ZOOM_FADE) {
          op = 1
          sc = 2 ** (f + 1)
        }
        el.style.opacity = op ? String(op) : '0'
        el.style.visibility = op ? 'visible' : 'hidden'
        el.style.transform = sc === 1 ? '' : `scale(${sc.toFixed(4)})`
      })
    }
    if (!located) {
      draw(0)
      return
    }
    if (!live || !exact) {
      draw(top)
      return
    }
    // Пока идёт шаг — каждый кадр масштаб по точному месту прокрутки.
    let raf = 0
    let last = -1
    const frame = () => {
      const p = exact.current
      const u = p && p.s === 1 && p.t === 4 ? Math.min(1, Math.max(0, (p.sub - ZOOM_FROM) / (ZOOM_TO - ZOOM_FROM))) : 1
      if (u !== last) {
        last = u
        // Разгон и торможение, как у пальцев: медленно, быстро, медленно.
        draw(top * (0.5 - 0.5 * Math.cos(Math.PI * u)))
      }
      raf = requestAnimationFrame(frame)
    }
    frame()
    return () => cancelAnimationFrame(raf)
  }, [located, live, exact])

  return (
    <span className={`tma-map${located ? ' is-located' : ''}${located && !live ? ' is-settled' : ''}`}>
      {DEMO_MAP ? (
        <span className="tma-map__layers">
          {DEMO_MAP.levels.map((src, i) => (
            <img
              key={src}
              ref={(el) => {
                layers.current[i] = el
              }}
              className="tma-map__img"
              src={src}
              alt=""
              decoding="async"
              style={i === 0 ? undefined : { opacity: 0, visibility: 'hidden' }}
            />
          ))}
        </span>
      ) : (
        <span className="tma-map__img tma-map__img--scheme">
          <svg viewBox="0 0 372 240" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
            <rect width="372" height="240" fill="#a7a59f" />
            <path d="M-10 172c60-8 92-30 150-30s96 26 160 18 70-20 90-22v110H-10Z" fill="#8d9ea6" />
            <path d="M0 40h372M0 104h372M60 0v240M168 0v240M286 0v240" stroke="#c4c2bc" strokeWidth="5" />
            <path d="M0 74h372M112 0v240M228 0v240M330 0v240" stroke="#bdbbb4" strokeWidth="2.5" />
            <path d="M-10 222C80 196 150 120 230 92s110-40 160-44" stroke="#c9b98c" strokeWidth="9" fill="none" />
            <path d="M-10 222C80 196 150 120 230 92s110-40 160-44" stroke="#d8cfa9" strokeWidth="5" fill="none" />
            <rect x="76" y="12" width="70" height="22" fill="#9aa892" />
            <rect x="244" y="118" width="34" height="40" fill="#9aa892" />
          </svg>
        </span>
      )}
      {located && (
        <span className="tma-pin">
          <span />
        </span>
      )}
      <span className="tma-osm">© OpenStreetMap</span>
    </span>
  )
}
