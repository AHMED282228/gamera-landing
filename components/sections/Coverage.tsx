import { AREA_SERVED } from '@/lib/config'
import { COVERAGE_TEXT, PRICE_TEXT } from '@/lib/content'
import { PhoneLink } from '@/components/ui/ActionButtons'

/**
 * Зона работы и стоимость — одной секцией в две колонки.
 *
 * Оба блока короткие и отвечают на смежные вопросы «доедете ли» и «сколько».
 * Отдельными секциями они смотрелись бы пустыми, а вопрос всё равно один.
 *
 * Цены — заглушка по брифу. Сумм нет и не будет, пока владелец их не назовёт:
 * выдуманный прайс на сайте эвакуатора превращается в спор при встрече.
 */
export function Coverage() {
  return (
    <section id="coverage" className="shell py-section">
      <div className="grid gap-block lg:grid-cols-2 lg:gap-px lg:bg-steel-1/40">
        <div className="reveal lg:bg-bg lg:pr-12">
          <div className="section-head">
            <p className="eyebrow">Зона работы</p>
            <h2 className="text-h1 text-ink">
              <span
                className="mask-line reveal-line"
                style={{ '--reveal-delay': '80ms' } as React.CSSProperties}
              >
                <span>Город и область</span>
              </span>
            </h2>
          </div>

          {/* Города стоят строкой, но с разделителями: без них два названия
              подряд читаются как одно длинное. */}
          <ul className="mb-5 flex flex-col gap-2">
            {AREA_SERVED.map((a) => (
              <li
                key={a}
                className="flex items-center gap-3 font-display text-h3 uppercase tracking-[0.01em] text-steel-3"
              >
                <span aria-hidden="true" className="h-px w-6 bg-red" />
                {a}
              </li>
            ))}
          </ul>

          <p className="prose-measure text-body text-steel-2">
            {COVERAGE_TEXT}
          </p>
        </div>

        <div
          className="reveal lg:bg-bg lg:pl-12"
          style={{ '--reveal-delay': '90ms' } as React.CSSProperties}
        >
          <div className="section-head">
            <p className="eyebrow">Стоимость</p>
            <h2 className="text-h1 text-ink">
              <span
                className="mask-line reveal-line"
                style={{ '--reveal-delay': '80ms' } as React.CSSProperties}
              >
                <span>Считаем по адресу</span>
              </span>
            </h2>
          </div>

          <p className="prose-measure text-body text-steel-2">{PRICE_TEXT}</p>

          <p className="mt-5">
            <PhoneLink size="lead" />
          </p>
        </div>
      </div>
    </section>
  )
}
