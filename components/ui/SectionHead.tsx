/**
 * Заголовок секции: тяжёлая строка + наклонная строка тёплым светом.
 * Проявляется полосой света слева направо (.h-light) — тот же ход, что у
 * фары в первом экране. Надзаголовков над ним нет намеренно.
 */
export function SectionHead({
  id,
  title,
  accent,
  intro,
  className = '',
}: {
  id?: string
  title: string
  accent?: string
  intro?: string
  className?: string
}) {
  return (
    <div className={className}>
      <h2 id={id} className="section-title h-light">
        {title}
        {accent && <span className="line-accent mt-1">{accent}</span>}
      </h2>
      {intro && <p className="section-intro reveal">{intro}</p>}
    </div>
  )
}
