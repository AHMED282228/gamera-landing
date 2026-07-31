import { CASES, VEHICLES, VEHICLES_NOTE } from '@/lib/content'

/**
 * «В каких случаях» и «Что забираем» стоят одной секцией.
 *
 * Человек, который сюда доскроллил, решает один вопрос: возьмут ли его случай
 * и его машину. Разносить ответ на две секции с отдельными заголовками — значит
 * заставить его листать дальше ради второй половины ответа.
 *
 * Пунктов пять, а не шесть, как в форме бота: см. комментарий к CASES.
 *
 * Раньше случаи стояли сеткой из карточек в рамках. Владелец назвал это
 * «таблицей из Excel», и он был прав: шесть одинаковых прямоугольников с
 * одинаковыми отступами — это таблица и есть, сколько её ни подкрашивай.
 * Разница между таблицей и разворотом в перепаде: здесь номер набран кеглем
 * заголовка, между строками только волосяная линия, а текст отодвинут в свою
 * колонку. Ничего не добавилось — убрались рамки и появился масштаб.
 */
export function Cases() {
  return (
    <section id="cases" className="shell py-section">
      <div className="section-head">
        <p className="eyebrow reveal">Заявки</p>
        <h2 className="text-h1 text-ink">
          <span
            className="mask-line reveal-line"
            style={{ '--reveal-delay': '80ms' } as React.CSSProperties}
          >
            <span>В каких случаях вызывают</span>
          </span>
        </h2>
      </div>

      <ol className="border-t border-steel-1/40">
        {CASES.map((c, i) => (
          <li
            key={c.title}
            className="reveal grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 gap-y-3 border-b border-steel-1/40 py-7 lg:grid-cols-[7rem_minmax(0,24rem)_minmax(0,30rem)] lg:gap-x-10 lg:py-9"
            style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
          >
            {/*
              Номер — графика, а не подпись: он держит левый край всей секции и
              задаёт её масштаб. Тусклый сталью намеренно, иначе пять крупных
              цифр перекрикивают названия случаев, ради которых сюда пришли.

              Подсветки при наведении здесь нет намеренно. Строка никуда не
              ведёт, а браузер пересчитывает :hover не во время прокрутки, а
              когда она кончилась, — поэтому строка, проехавшая под неподвижным
              курсором, загоралась с опозданием и выглядела сбоем. Отклик на
              наведение остаётся там, где на него можно нажать.
            */}
            <span
              aria-hidden="true"
              className="font-display text-num tabular-nums leading-none text-steel-1"
            >
              {String(i + 1).padStart(2, '0')}
            </span>

            <h3 className="text-h2 text-ink">{c.title}</h3>

            {/* На узком экране текст уходит под номер и заголовок, на широком
                встаёт третьей колонкой. */}
            <p className="col-span-2 text-body text-steel-2 lg:col-span-1">
              {c.text}
            </p>
          </li>
        ))}
      </ol>

      {/*
        «Что забираем» вынесен из общего ряда. Шестой ячейкой сетки он читался
        как шестой случай — то есть как продолжение перечня бед, хотя отвечает
        на другой вопрос: не «возьмут ли мою беду», а «возьмут ли мою машину».
      */}
      <div className="reveal mt-block grid gap-x-10 gap-y-6 lg:grid-cols-[7rem_minmax(0,1fr)]">
        <p className="eyebrow lg:pt-1">Что забираем</p>

        <div>
          <ul className="flex flex-col gap-4">
            {VEHICLES.map((v) => (
              <li
                key={v.title}
                className="flex flex-wrap items-baseline gap-x-4 border-b border-steel-1/25 pb-4"
              >
                <span className="font-display text-h3 uppercase tracking-[0.02em] text-ink">
                  {v.title}
                </span>
                <span className="text-body text-steel-2">{v.note}</span>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-label text-steel-2">{VEHICLES_NOTE}</p>
        </div>
      </div>
    </section>
  )
}
