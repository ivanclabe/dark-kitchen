import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import { cardClass } from './formClasses'
import { Skeleton } from './Skeleton'

/**
 * Estados de carga del Design System. `variant`:
 *   rows   — lista/tabla (skeleton de filas)
 *   cards  — grilla de tarjetas (KPIs, tickets)
 *   block  — un solo bloque (gráfico, detalle)
 *   inline — spinner + texto, para zonas pequeñas
 */
export function LoadingState({
  variant = 'rows',
  rows = 4,
  cols = 3,
  label = 'Cargando…',
  className,
}: {
  variant?: 'rows' | 'cards' | 'block' | 'inline'
  rows?: number
  cols?: number
  label?: string
  className?: string
}) {
  if (variant === 'inline') {
    return (
      <p role="status" className={clsx('inline-flex items-center gap-2 text-sm text-neutral-500', className)}>
        <Loader2 size={14} className="animate-spin" aria-hidden /> {label}
      </p>
    )
  }

  if (variant === 'cards') {
    return (
      <div role="status" aria-label={label} className={clsx('grid gap-4', { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' }[Math.min(cols, 4) as 1 | 2 | 3 | 4], className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={cardClass}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'block') {
    return (
      <div role="status" aria-label={label} className={clsx(cardClass, 'space-y-3', className)}>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    )
  }

  return (
    <div role="status" aria-label={label} className={clsx('space-y-2 p-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={clsx('h-4', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}
