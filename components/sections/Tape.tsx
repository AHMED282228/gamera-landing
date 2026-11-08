import { TAPE } from '@/lib/content'

/**
 * Две сигнальные ленты крестом — как ограждение у места, где встала машина.
 * Передняя — красная со строкой случаев, задняя — красно-белая полосатая,
 * идёт навстречу. По обеим пробегает блик, как свет фары по светоотражающей
 * плёнке. Строка повторена дважды для бесшовного хода; читателю экрана лента
 * скрыта — те же случаи подробно описаны в секции ниже.
 */
export function Tape() {
  const items = [...TAPE, ...TAPE]
  return (
    <div className="tape-x" aria-hidden="true">
      <div className="tape tape--back">
        <div className="tape__stripes" />
      </div>
      <div className="tape tape--front">
        <div className="tape__track">
          {items.map((t, i) => (
            <span key={i} className="tape__item">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
