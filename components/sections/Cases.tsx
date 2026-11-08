import { CASES, CASES_HEAD, VEHICLES } from '@/lib/content'
import { SectionHead } from '@/components/ui/SectionHead'

/** Когда вызывают: слева заголовок и что возим, справа — случаи строками. */
export function Cases() {
  return (
    <section id="cases" aria-labelledby="cases-title" className="section shell">
      <div className="cases">
        <div className="cases__head">
          <SectionHead id="cases-title" {...CASES_HEAD} />
          <div className="vehicles reveal">
            <p className="vehicles__label">{VEHICLES.label}</p>
            <p className="vehicles__list">{VEHICLES.list}</p>
            <p className="vehicles__note">{VEHICLES.note}</p>
          </div>
        </div>
        <ul className="case-list">
          {CASES.map((c, i) => (
            <li key={c.title} className="case-row reveal" style={{ '--i': i % 3 } as React.CSSProperties}>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
