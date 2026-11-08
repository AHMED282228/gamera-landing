/**
 * Значки — свои SVG одной толщины линии (1.75) и одного размера сетки 24.
 * Цвет — currentColor, размер задаёт CSS.
 */

type P = { className?: string }

export function TelegramIcon({ className = '' }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M21 4.5 2.9 11.4c-.8.3-.8 1.4 0 1.7l4.4 1.5 1.7 5.2c.2.7 1.1.9 1.6.4l2.5-2.4 4.5 3.3c.6.4 1.4.1 1.6-.6L22.1 5.6c.2-.8-.5-1.4-1.1-1.1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="m7.4 14.6 9.8-6.9-6.6 8.1" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  )
}

export function PhoneIcon({ className = '' }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M5.2 3.5h3l1.6 4.3-2 1.3a11 11 0 0 0 7.1 7.1l1.3-2 4.3 1.6v3a1.7 1.7 0 0 1-1.8 1.7A16.6 16.6 0 0 1 3.5 5.3 1.7 1.7 0 0 1 5.2 3.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ArrowUpRight({ className = '' }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M7 17 17 7M8.5 7H17v8.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
