import clsx from 'clsx'

export interface OperationsFigure {
  id: string
  label: string
  value: number
  /** Red when above zero (late, unpaid…). */
  tone?: 'warn'
  /** Opens where those orders are (a view, already filtered). */
  onSelect?: () => void
}

/**
 * The line of figures of the Centro de operaciones (ADR 0031): counts, not
 * charts — operating, not analysing. Each figure opens its orders.
 */
export function OperationsFigures({ items }: { items: OperationsFigure[] }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Resumen de la operación" className={clsx('grid gap-2', items.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-7')}>
      {items.map((f) => {
        const body = (
          <>
            <span className={clsx('block text-xl leading-none font-semibold tabular-nums', f.tone === 'warn' && f.value > 0 ? 'text-red-400' : 'text-neutral-50')}>{f.value}</span>
            <span className="mt-1.5 block truncate text-xs text-neutral-500">{f.label}</span>
          </>
        )
        const box = 'block w-full min-w-0 rounded-xl border border-neutral-800/60 bg-neutral-900/60 px-3.5 py-2.5 text-left'
        return (
          <li key={f.id}>
            {f.onSelect ? (
              <button type="button" onClick={f.onSelect} className={clsx(box, 'transition-colors hover:border-neutral-700 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500')}>
                {body}
              </button>
            ) : (
              <div className={box}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
