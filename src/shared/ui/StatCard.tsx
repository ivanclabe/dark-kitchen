import clsx from 'clsx'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cardClass } from './formClasses'
import { typography } from './typography'

export type StatTone = 'neutral' | 'brand' | 'good' | 'warn'

const ICON_TONE: Record<StatTone, string> = {
  neutral: 'bg-neutral-800/80 text-neutral-300',
  brand: 'bg-brasa-500/10 text-brasa-400',
  good: 'bg-emerald-500/10 text-emerald-400',
  warn: 'bg-red-500/10 text-red-400',
}

/**
 * Tarjeta de métrica del Design System — reemplaza los 3 KpiCard/MetricCard
 * que había (Dashboard, Cartera, SLA). `emphasis` sube la jerarquía de la
 * cifra para las métricas que importan más; `to` la convierte en enlace
 * accionable; `trend` muestra un delta con signo.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  emphasis = false,
  to,
  trend,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ComponentType<{ size?: number; className?: string }>
  tone?: StatTone
  emphasis?: boolean
  to?: string
  /** Porcentaje de variación vs. el período anterior. */
  trend?: { pct: number; label?: string }
  className?: string
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className={typography.label}>{label}</p>
        {Icon && (
          <span className={clsx('flex size-8 shrink-0 items-center justify-center rounded-lg', ICON_TONE[tone])}>
            <Icon size={16} aria-hidden />
          </span>
        )}
      </div>
      <p className={clsx('mt-2 tabular-nums', emphasis ? typography.display : 'text-2xl font-semibold tracking-tight text-neutral-50')}>
        {value}
      </p>
      {(hint || trend) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {trend && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                trend.pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
              )}
            >
              {trend.pct >= 0 ? <TrendingUp size={11} aria-hidden /> : <TrendingDown size={11} aria-hidden />}
              {trend.pct >= 0 ? '+' : ''}
              {trend.pct}%{trend.label ? ` ${trend.label}` : ''}
            </span>
          )}
          {hint && <p className={typography.caption}>{hint}</p>}
        </div>
      )}
    </>
  )

  const base = clsx(cardClass, 'flex flex-col', className)

  if (to) {
    return (
      <Link to={to} className={clsx(base, 'transition-colors hover:border-neutral-700 hover:bg-neutral-900')}>
        {content}
      </Link>
    )
  }
  return <div className={base}>{content}</div>
}
