import { typography } from './typography'
import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

/** Which direction is good news for this figure (costs going up is not). */
export type GoodWhen = 'up' | 'down' | 'neutral'

export interface Kpi {
  id: string
  label: string
  value: string
  /** Relative change vs the previous period (null = nothing to compare with). */
  change: number | null
  /** For margins: the change in percentage points, already formatted. */
  changeLabel?: string
  goodWhen: GoodWhen
  hint?: string
  /** Daily values for the tiny trend line. */
  series?: number[]
  onSelect?: () => void
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26 - 1}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-3 h-7 w-full text-neutral-600" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** +0.124 → "+12,4 %". */
function formatChange(ratio: number): string {
  const sign = ratio > 0 ? '+' : ratio < 0 ? '−' : ''
  return `${sign}${Math.abs(ratio * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`
}

/**
 * The key figures in ONE strip (ADR 0027, used by Insights and Clientes): value, change vs the previous
 * period and a tiny trend — not a wall of separate cards. A figure with no
 * previous value says so instead of showing a made-up percentage.
 */
export function KpiStrip({ items, compareLabel = null, columns = 6 }: { items: Kpi[]; compareLabel?: string | null; columns?: 3 | 4 | 6 }) {
  return (
    // gap-px over the line color draws the dividers between tiles at every breakpoint.
    <div
      className={clsx(
        'grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-neutral-800/60 bg-neutral-800/60',
        columns === 6 ? 'sm:grid-cols-3 xl:grid-cols-6' : columns === 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3',
      )}
    >
      {items.map((k) => {
        const tone =
          k.change === null || k.goodWhen === 'neutral' || k.change === 0
            ? 'text-neutral-400'
            : (k.change > 0) === (k.goodWhen === 'up')
              ? 'text-emerald-400'
              : 'text-red-400'
        const Arrow = k.change === null || k.change === 0 ? Minus : k.change > 0 ? ArrowUpRight : ArrowDownRight
        const body = (
          <>
            <p className={typography.label}>{k.label}</p>
            <p className="mt-1.5 truncate text-xl font-semibold tracking-tight text-neutral-50 tabular-nums sm:text-2xl">{k.value}</p>
            {compareLabel && (
              <p className={clsx('mt-1 flex items-center gap-1 text-xs', tone)}>
                <Arrow size={13} aria-hidden />
                {k.change === null && !k.changeLabel ? 'sin datos para comparar' : (k.changeLabel ?? formatChange(k.change ?? 0))}
                {(k.change !== null || k.changeLabel) && <span className="truncate text-neutral-500">vs. {compareLabel}</span>}
              </p>
            )}
            {k.hint && <p className={clsx('mt-1 truncate', typography.caption)}>{k.hint}</p>}
            {k.series && <Sparkline values={k.series} />}
          </>
        )
        const cell = 'min-w-0 bg-neutral-900 p-4'
        return k.onSelect ? (
          <button key={k.id} type="button" onClick={k.onSelect} className={clsx(cell, 'text-left transition-colors hover:bg-neutral-800/30 focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none')}>
            {body}
          </button>
        ) : (
          <div key={k.id} className={cell}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
