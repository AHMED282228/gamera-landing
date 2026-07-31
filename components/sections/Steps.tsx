import { STEPS } from '@/lib/content'
import { CallButton } from '@/components/ui/ActionButtons'

/**
 * «Как проходит вызов» — три шага.
 *
 * Первый вариант был собран из блока «How It Works Timeline» на 21st.dev: слева
 * колонка из квадрата с номером и волосяной линии-связки. Он честно работал, но
 * после того, как секция случаев переехала на крупные номера и волосяные
 * разделители, эти квадратики остались единственным местом на странице со своей
 * пластикой — мелкие рамки посреди страницы, где рамок больше нигде нет.
 * Поэтому здесь тот же язык: номер кеглем заголовка, между шагами линия.
 *
 * Отличие от случаев осознанное. Там три колонки и номер работает указателем в
 * длинном перечне; здесь шагов всего три, они читаются подряд, и колонки две —
 * иначе строка растянулась бы на всю ширину и порядок перестал бы читаться как
 * порядок.
 *
 * Сроков приезда в шагах нет намеренно — бриф запрещает обещать «за N минут».
 */
export function Steps() {
  return (
    <section id="steps" className="shell py-section">
      {/*
        На широком экране заголовок уходит в свою колонку слева и липнет к верху:
        пока человек читает шаги, у него перед глазами остаётся, к чему они
        относятся. До этого секция жила в левой трети окна, а правые две трети
        оставались чёрными.
      */}
      {/*
        Левая колонка шире, чем кажется нужным по тексту. Причина в маске: она
        обрезает не только по вертикали, но и по горизонтали, и на 20rem слово
        «ПРОХОДИТ» кеглем 76px не помещалось — заголовок выезжал уже обрубленным
        с правого края.
      */}
      <div className="lg:grid lg:grid-cols-[minmax(0,25rem)_minmax(0,42rem)] lg:gap-x-14">
        <div className="section-head reveal lg:sticky lg:top-28 lg:mb-0 lg:self-start">
          <p className="eyebrow">Порядок</p>
          <h2 className="text-h1 text-ink">
            <span
              className="mask-line reveal-line"
              style={{ '--reveal-delay': '80ms' } as React.CSSProperties}
            >
              <span>Как проходит вызов</span>
            </span>
          </h2>
        </div>

        <div>
          <ol className="border-t border-steel-1/40">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="reveal grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 gap-y-2 border-b border-steel-1/40 py-7 lg:gap-x-10 lg:py-9"
                style={
                  { '--reveal-delay': `${i * 90}ms` } as React.CSSProperties
                }
              >
                {/* Без подсветки при наведении — та же причина, что в секции
                    случаев: шаг никуда не ведёт, а :hover на прокручиваемой
                    строке срабатывает с опозданием. */}
                <span
                  aria-hidden="true"
                  className="font-display text-num tabular-nums leading-none text-steel-1"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>

                <h3 className="text-h2 text-ink">{s.title}</h3>

                {/* Текст под номером и заголовком, а не третьей колонкой:
                    шагов три, их читают подряд сверху вниз, и разводить строку
                    ещё и вширь значит заставить глаз ходить туда-сюда. */}
                <p className="col-span-2 max-w-[46ch] text-body text-steel-2 lg:col-start-2 lg:col-span-1">
                  {s.text}
                </p>
              </li>
            ))}
          </ol>

          <div
            className="reveal mt-block"
            style={{ '--reveal-delay': '270ms' } as React.CSSProperties}
          >
            <CallButton />
          </div>
        </div>
      </div>
    </section>
  )
}
