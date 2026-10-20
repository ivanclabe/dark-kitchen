import clsx from 'clsx'
import type { ComponentType, ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet'

// ADR 0065: the states are semantic tokens (they follow the theme; ≥ 4.5:1 on their tint in all three).
const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-800 text-neutral-300',
  brand: 'bg-neutral-50/15 text-neutral-50',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  violet: 'bg-violet-500/15 text-violet-400',
}

const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-400',
  brand: 'bg-neutral-50',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  violet: 'bg-violet-400',
}

/**
 * Pill de estado del Design System. Un solo componente para "Activo",
 * estados de pedido, alertas de stock, etc. — antes había 11 copias del
 * mismo markup con colores decididos en cada archivo.
 */
export function Badge({
  tone = 'neutral',
  size = 'md',
  icon: Icon,
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  icon?: ComponentType<{ size?: number; className?: string }>
  /** Punto de color en vez de ícono — útil en listas densas. */
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium',
        // sm: 11 px, the minimum text of the interface (10 px was unreadable at a kitchen distance).
        size === 'sm' ? 'px-1.5 py-px text-2xs' : 'px-2 py-0.5 text-xs',
        TONE[tone],
        className,
      )}
    >
      {dot && <span className={clsx('size-1.5 rounded-full', DOT[tone])} aria-hidden />}
      {Icon && <Icon size={size === 'sm' ? 10 : 11} aria-hidden />}
      {children}
    </span>
  )
}

/** Atajo para el par más repetido de la app: Activo / Inactivo. */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'success' : 'neutral'} dot>
      {active ? 'Activo' : 'Inactivo'}
    </Badge>
  )
}
