import clsx from 'clsx'
import type { ComponentType, ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-800 text-neutral-300',
  brand: 'bg-brasa-500/15 text-brasa-400',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  danger: 'bg-red-500/15 text-red-400',
  info: 'bg-sky-500/15 text-sky-400',
  violet: 'bg-violet-500/15 text-violet-400',
}

const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-400',
  brand: 'bg-brasa-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  info: 'bg-sky-400',
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
        size === 'sm' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs',
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
