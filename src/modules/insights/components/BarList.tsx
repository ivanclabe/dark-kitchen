import clsx from 'clsx'

export interface BarItem {
  id: string
  label: string
  value: number
  valueLabel: string
  /** Second figure on the right (e.g. the margin). */
  detail?: string
  onSelect?: () => void
}

/**
 * Horizontal bars to compare a few items at a glance (categories, channels,
 * days, hours): label, a bar proportional to the largest value, the value.
 */
export function BarList({ items, emptyText = 'Sin datos en este periodo.' }: { items: BarItem[]; emptyText?: string }) {
  if (items.length === 0) return <p className="text-sm text-neutral-500">{emptyText}</p>
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="space-y-2.5">
      {items.map((i) => {
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-neutral-200">{i.label}</span>
              <span className="shrink-0 tabular-nums text-neutral-100">
                {i.valueLabel}
                {i.detail && <span className="ml-2 text-neutral-500">{i.detail}</span>}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full rounded-full bg-brasa-500" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
            </div>
          </>
        )
        return (
          <li key={i.id}>
            {i.onSelect ? (
              <button type="button" onClick={i.onSelect} className={clsx('w-full rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none')}>
                {row}
              </button>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ul>
  )
}
