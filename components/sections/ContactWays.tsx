import { CONTACT_WAYS } from '@/lib/content'
import { BotButton, CallButton } from '@/components/ui/ActionButtons'

/**
 * «Позвонить или написать» — что происходит на каждом пути и когда какой брать.
 *
 * Секции не было вовсе, а вопрос у человека есть: на первом экране стоят две
 * кнопки рядом, и какая из них его — непонятно. Две равные кнопки без объяснения
 * работают хуже одной: выбор без критерия тормозит, особенно в ситуации, ради
 * которой сюда пришли.
 *
 * Стоит сразу после «в каких случаях»: там человек убедился, что его беду
 * возьмут, и следующий его вопрос — как именно позвать.
 *
 * Никаких сроков и обещаний в текстах нет, см. комментарий к CONTACT_WAYS.
 */
export function ContactWays() {
  return (
    <section id="ways" className="shell py-section">
      <div className="section-head">
        <p className="eyebrow reveal">Как связаться</p>
        <h2 className="text-h1 text-ink">
          <span
            className="mask-line reveal-line"
            style={{ '--reveal-delay': '80ms' } as React.CSSProperties}
          >
            <span>Позвонить или написать</span>
          </span>
        </h2>
      </div>

      {/*
        Две колонки разделены волосяной линией, а не рамками: рамки вернули бы
        сюда те же карточки, из-за которых секция случаев выглядела таблицей.
        На узком экране линия становится горизонтальной сама — она нарисована
        как фон сетки, а не как граница блоков.
      */}
      <div className="grid gap-px bg-steel-1/40 lg:grid-cols-2">
        {CONTACT_WAYS.map((w, i) => (
          <div
            key={w.kind}
            className="reveal flex flex-col bg-bg pt-8 lg:pt-10"
            style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
          >
            <div className={i === 0 ? 'lg:pr-12' : 'lg:pl-12'}>
              <p className="eyebrow">{w.label}</p>

              <h3 className="mt-4 font-display text-h2 uppercase tracking-[0.01em] text-ink">
                {w.title}
              </h3>

              <p className="mt-4 max-w-[34ch] text-lead text-steel-2">
                {w.text}
              </p>

              {/*
                «Когда выбрать» набрано моноширинным с номерами: это не
                перечисление достоинств, а признаки ситуации, по которым человек
                узнаёт свою. Номера дают взгляду за что зацепиться, когда читают
                по диагонали.
              */}
              <ul className="mt-8 flex flex-col">
                {w.when.map((line, k) => (
                  <li
                    key={line}
                    className="flex items-baseline gap-4 border-t border-steel-1/25 py-4"
                  >
                    <span
                      aria-hidden="true"
                      className="font-mono text-hud tracking-[0.16em] text-amber"
                    >
                      {String(k + 1).padStart(2, '0')}
                    </span>
                    <span className="text-body text-steel-3">{line}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 pb-8 lg:pb-10">
                {w.kind === 'call' ? <CallButton /> : <BotButton />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
