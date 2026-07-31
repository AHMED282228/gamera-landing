import { PHONE_DISPLAY, PHONE_HREF, TG_CONFIGURED, TG_LINK } from '@/lib/config'

/**
 * Две кнопки действия. Живут отдельным компонентом, потому что повторяются
 * на первом экране, в финальном блоке и в прилипшей мобильной панели.
 *
 * Текст на красном — чистый белый, а не --ink: на --red-hot у --ink контраст
 * 4.38 при требуемых 4.5, у белого 5.13.
 */

/*
 * Отклик на нажатие — сжатие до 0.97, а не сдвиг на пиксель, как было раньше.
 *
 * Сдвиг вниз читается как «кнопка съехала», особенно когда рядом стоит вторая:
 * ряд на мгновение теряет общую линию. Сжатие же ощущается как настоящее
 * нажатие — кнопка уходит под палец, а не в сторону, и соседи стоят на месте.
 */
const BASE =
  'inline-flex min-h-12 items-center justify-center px-6 font-display text-label ' +
  'font-semibold uppercase tracking-[0.12em] rounded-xs cursor-pointer ' +
  'btn-motion active:scale-[0.97]'

export function CallButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={PHONE_HREF}
      className={`${BASE} bg-red text-on-red hover:bg-red-hot ${className}`}
    >
      Позвонить
    </a>
  )
}

/**
 * Кнопка в Telegram-бота.
 *
 * Пока юзернейм бота не заполнен, кнопки нет вовсе. Заглушка в конфиге —
 * это строка внутри адреса, и собранная страница уносила её прямо в href:
 * получалась живая кнопка на t.me/__ЗАПОЛНИТЬ__, то есть на несуществующий
 * аккаунт. Человек со сломавшейся машиной жмёт её, видит ошибку Telegram и
 * уходит — хуже, чем если бы кнопки не было.
 *
 * Как только в config.ts появится настоящее имя, кнопка вернётся сама везде,
 * где она расставлена. До тех пор работает телефон — главное действие по брифу.
 */
export function BotButton({ className = '' }: { className?: string }) {
  if (!TG_CONFIGURED) return null

  return (
    <a
      href={TG_LINK}
      target="_blank"
      rel="noopener"
      className={`${BASE} border border-steel-1 text-ink hover:border-steel-3 hover:text-white ${className}`}
    >
      Заказать в боте
    </a>
  )
}

/**
 * Телефон отдельной строкой — его читают глазами, а не только жмут.
 *
 * Размер задаётся отдельным свойством, а не классом через className: у Tailwind
 * два класса размера не спорят по «кто последний в строке», побеждает тот, что
 * ниже в собранном CSS. Переданный снаружи text-lead молча проигрывал базовому
 * text-mono, и телефон в блоке стоимости оставался мелким.
 */
export function PhoneLink({
  size = 'mono',
  className = '',
}: {
  size?: 'mono' | 'lead'
  className?: string
}) {
  return (
    <a
      href={PHONE_HREF}
      className={`font-mono ${size === 'lead' ? 'text-lead' : 'text-mono'} whitespace-nowrap tracking-[0.06em] text-steel-3 transition-tint duration-200 hover:text-ink ${className}`}
    >
      {PHONE_DISPLAY}
    </a>
  )
}
