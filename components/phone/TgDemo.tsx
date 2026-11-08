'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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

/** Аватар и фото приветствия бота — логотип на чёрном, как в самом боте. */
const AVATAR = '/brand/bot-avatar.webp'
const HELLO_PHOTO = '/brand/bot-hello.webp'

/**
 * Заказ через бота на экране iPhone: чат Telegram (тёмная тема iOS) и
 * мини-приложение с настоящей формой заявки. Сцена (scene) приходит снаружи
 * — это этап, до которого человек долистал; внутри сцены мелкие шаги
 * (набор имени, выбор чипа, нажатие кнопки) идут по времени.
 *
 * Вперёд — сцена проигрывается с начала; назад — сразу конечный вид
 * этапа, без повторного проигрыша. При «уменьшить движение» всегда
 * конечный вид.
 */

/** Моменты мелких шагов внутри сцены, мс от её начала. */
const SCHEDULE: readonly (readonly number[])[] = [
  [0, 700, 1700],
  [0, 650, 1300, 2100, 2900, 3600, 4100, 4800, 5500, 6100],
  [0, 1500, 1900, 2400, 3500],
  [0, 650],
  [0, 650, 1500, 2600],
]
const LAST = SCHEDULE.map((s) => s.length - 1)

/** Время в строке состояния на каждом этапе. */
const CLOCK = ['23:41', '23:42', '23:43', '23:52', '00:47'] as const

type Props = {
  /** Этап 0…4. */
  scene: number
  /** false — показать конечный вид этапа без проигрыша (до прокрутки сюда, назад, reduced motion). */
  play: boolean
}

export function TgDemo({ scene, play }: Props) {
  const [tick, setTick] = useState(LAST[scene])
  const prevScene = useRef(-1)

  useEffect(() => {
    const forward = scene > prevScene.current
    prevScene.current = scene
    if (!play || !forward) {
      setTick(LAST[scene])
      return
    }
    setTick(0)
    const timers = SCHEDULE[scene].slice(1).map((ms, i) => window.setTimeout(() => setTick(i + 1), ms))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [scene, play])

  const at = (s: number, t = 0) => scene > s || (scene === s && tick >= t)
  const now = (s: number, t: number) => scene === s && tick === t

  const sheetOpen = at(1) && !at(2, 2)
  const success = at(2)

  // Куда прокручена форма внутри мини-приложения.
  let formAt: FormSection = 'top'
  if (scene === 1) {
    if (tick >= 8) formAt = 'end'
    else if (tick >= 7) formAt = 'cond'
    else if (tick >= 5) formAt = 'car'
    else if (tick >= 3) formAt = 'route'
  } else if (scene > 1) formAt = 'end'

  return (
    <div className={`tg${sheetOpen ? ' tg--sheet' : ''}`}>
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
            <img src={AVATAR} width={132} height={132} alt="" loading="lazy" decoding="async" />
          </span>
        </div>

        <div className="tg-feed">
          <span className="tg-date">Сегодня</span>

          <Bubble out time={TIMES[0]}>/start</Bubble>

          {at(0, 1) && (
            <Group
              keys={[[BTN_CALL], [BTN_ORDERS]]}
              tap={now(0, 2) ? BTN_CALL : undefined}
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

          {at(2, 3) && (
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

          {at(2, 4) && <StatusBubble msg={STATUS_MSGS.accepted} time={TIMES[3]} />}
          {at(3, 1) && <StatusBubble msg={STATUS_MSGS.enRoute} time={TIMES[4]} />}
          {at(4, 1) && <StatusBubble msg={STATUS_MSGS.done} time={TIMES[5]} />}

          {at(4, 2) && (
            <Group
              keys={[['1 ⭐', '2 ⭐', '3 ⭐', '4 ⭐', '5 ⭐']]}
              tap={at(4, 3) ? '5 ⭐' : undefined}
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
            <SuccessScreen tapDone={now(2, 1)} />
          ) : (
            <OrderForm at={at} now={now} section={formAt} />
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
      {photo && <img src={photo} width={600} height={600} alt="" className="tg-photo" loading="lazy" decoding="async" />}
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
}: {
  children: ReactNode
  keys: readonly (readonly string[])[]
  tap?: string
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
              <span key={k} className={`tg-key${tap === k ? ' is-tap' : ''}`}>
                {k}
                {appKey === k && <i className="tg-key__app" />}
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

type FormSection = 'top' | 'route' | 'car' | 'cond' | 'end'
type At = (s: number, t?: number) => boolean
type Now = (s: number, t: number) => boolean

function OrderForm({ at, now, section }: { at: At; now: Now; section: FormSection }) {
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
    const target = section === 'end' ? max : section === 'top' ? 0 : (refs.current[section]?.offsetTop ?? 0) - 10
    setY(Math.min(max, Math.max(0, target)))
  }, [section])

  const filled = (v: boolean, value: string, placeholder: string) => (
    <span className={`tma-input${v ? ' is-filled' : ''}`}>{v ? value : placeholder}</span>
  )
  const seg = (on: boolean, options: string[], pick: string) => (
    <span className="tma-seg">
      {options.map((o) => (
        <span key={o} className={on && o === pick ? 'is-on' : undefined}>
          {o}
        </span>
      ))}
    </span>
  )

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
            {filled(at(1, 1), FORM_DEMO.name, 'Как к вам обращаться')}
          </div>
          <div className="tma-field">
            <span className="tma-label">Телефон</span>
            <span className="tma-row">
              {filled(at(1, 2), FORM_DEMO.phone, '+7 (9__) ___-__-__')}
              <span className={`tma-btn2${now(1, 2) ? ' is-tap' : ''}`}>📱 Из Telegram</span>
            </span>
          </div>
        </section>

        <section className="tma-card" ref={(el) => { refs.current.route = el }}>
          <h4 className="tma-card-title">Маршрут</h4>
          <div className="tma-field">
            <span className="tma-label">Откуда забрать</span>
            <MapTile pin={at(1, 3)} />
            <span className="tma-hint">Тапните по карте или перетащите метку — GPS в области бывает неточным, проверьте точку глазами.</span>
            <span className={`tma-btn2 tma-geo${now(1, 3) ? ' is-tap' : ''}`}>📍 Определить моё местоположение</span>
            {filled(at(1, 3), FORM_DEMO.from, 'Адрес или ориентир (шоссе, км, съезд)')}
            <span className={`tma-confirm${at(1, 4) ? ' is-ok' : ''}`}>
              {at(1, 4) ? 'Точка «Откуда» подтверждена' : '✓ Подтвердить точку «Откуда»'}
            </span>
          </div>
          <div className="tma-field">
            <span className="tma-label">Куда отвезти</span>
            {filled(at(1, 4), FORM_DEMO.to, 'Адрес назначения (СТО, стоянка, дом)')}
          </div>
        </section>

        <section className="tma-card" ref={(el) => { refs.current.car = el }}>
          <h4 className="tma-card-title">Автомобиль</h4>
          <div className="tma-field">
            <span className="tma-label">Тип транспорта</span>
            <span className="tma-chips">
              {FORM_DEMO.vehicles.map((v) => (
                <span key={v} className={at(1, 5) && v === FORM_DEMO.vehicle ? 'is-on' : undefined}>{v}</span>
              ))}
            </span>
          </div>
          <div className="tma-field">
            <span className="tma-label">Что случилось</span>
            <span className="tma-chips">
              {FORM_DEMO.reasons.map((v) => (
                <span key={v} className={at(1, 6) && v === FORM_DEMO.reason ? 'is-on' : undefined}>{v}</span>
              ))}
            </span>
          </div>
        </section>

        <section className="tma-card" ref={(el) => { refs.current.cond = el }}>
          <h4 className="tma-card-title">Условия погрузки</h4>
          <p className="tma-card-hint">От этого зависит, каким способом водитель погрузит автомобиль.</p>
          <div className="tma-field"><span className="tma-label">Колёса крутятся?</span>{seg(at(1, 7), ['Да', 'Нет'], 'Да')}</div>
          <div className="tma-field"><span className="tma-label">Руль разблокирован?</span>{seg(at(1, 7), ['Да', 'Нет'], 'Да')}</div>
          <div className="tma-field"><span className="tma-label">Привод</span>{seg(at(1, 7), ['Полный', 'Задний', 'Передний'], 'Передний')}</div>
          <div className="tma-field"><span className="tma-label">Стоит на ручнике или в передаче?</span>{seg(at(1, 7), ['Да', 'Нет'], 'Да')}</div>
          <div className="tma-field"><span className="tma-label">Можно ли поставить на нейтраль?</span>{seg(at(1, 7), ['Да', 'Нет'], 'Да')}</div>
        </section>

        <section className="tma-card">
          <div className="tma-field">
            <span className="tma-label">Комментарий <em>(необязательно)</em></span>
            <span className="tma-input tma-area">Например: машина в паркинге, низкий потолок</span>
          </div>
          <span className="tma-consent">
            <span className={`tma-check${at(1, 8) ? ' is-on' : ''}`} />
            <span>
              Я согласен(на) на обработку персональных данных в соответствии с <u>политикой конфиденциальности</u>
            </span>
          </span>
        </section>

        <span className={`tma-primary${now(1, 9) ? ' is-tap' : ''}`}>🚨 Вызвать эвакуатор</span>
        <footer className="tma-footer">G.AMERA · Санкт-Петербург и Ленинградская область</footer>
      </div>
    </div>
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
 * Карта выбора точки — как в мини-приложении: светлые тайлы OpenStreetMap,
 * приглушённые фильтром (brightness .72, saturate .55). Нарисована схемой,
 * без загрузки тайлов: это демонстрация, а не карта.
 */
function MapTile({ pin }: { pin: boolean }) {
  return (
    <span className="tma-map">
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
      {pin && (
        <span className="tma-pin">
          <span />
        </span>
      )}
      <span className="tma-osm">© OpenStreetMap</span>
    </span>
  )
}
