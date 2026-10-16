import { formatMoney } from '@/shared/utils/format'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { useReceivablesAging } from '../hooks/useReceivables'

const BUCKETS = [
  { key: 'current', label: 'Al día', tone: 'bg-emerald-500/70' },
  { key: 'd1_30', label: '1-30 días', tone: 'bg-amber-400/80' },
  { key: 'd31_60', label: '31-60 días', tone: 'bg-orange-500/80' },
  { key: 'd61', label: 'Más de 60', tone: 'bg-red-500/80' },
] as const

/**
 * ADR 0063 (D5): the age of what customers owe. «Al día» includes the orders
 * without a term (they never fall due). Nothing shows when nobody owes.
 */
export function ReceivablesAgingBar() {
  const { data } = useReceivablesAging()
  if (!data || data.total <= 0) return null
  return (
    <section aria-label="Antigüedad de la cartera" className="space-y-2 rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={typography.overline}>Antigüedad de la cartera</p>
        <p className="text-xs text-neutral-500 tabular-nums">Total {formatMoney(data.total)}</p>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
        {BUCKETS.map((b) => (data[b.key] > 0 ? <div key={b.key} className={clsx('h-full', b.tone)} style={{ width: `${(data[b.key] / data.total) * 100}%` }} /> : null))}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {BUCKETS.map((b) => (
          <div key={b.key} className="flex items-center gap-1.5">
            <span className={clsx('size-2 shrink-0 rounded-full', b.tone)} aria-hidden />
            <dt className="text-neutral-400">{b.label}</dt>
            <dd className="ml-auto font-medium tabular-nums text-neutral-100">{formatMoney(data[b.key])}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
