import type { RobotMood } from '@/shared/robot/expressions'
import clsx from 'clsx'
import type { ComponentType, ReactNode } from 'react'
import { Feedback } from './Feedback'
import { typography } from './typography'

/**
 * Empty state útil: qué falta + por qué + qué hacer (action). Úsalo dentro
 * de una Card/tabla; no trae borde propio para no anidar cajas.
 *
 * ADR 0060: el estado de una pantalla (no compacto) lo acompaña el robot de
 * Quanela; `mood` elige su expresión (por defecto `empty`; «Sin resultados»
 * → `noResults`, nada pendiente → `idle`). Los compactos, dentro de una
 * tarjeta o tabla, conservan su ícono para no repetir el robot, salvo que
 * pidan un `mood`. `mood={null}` conserva el ícono en un estado de pantalla
 * (instrucciones como «Selecciona una compra» o permisos).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  mood,
  className,
}: {
  icon?: ComponentType<{ size?: number; className?: string }>
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
  mood?: RobotMood | null
  className?: string
}) {
  if (mood || (!compact && mood !== null)) {
    return <Feedback layout="block" tone={mood ?? 'empty'} compact={compact} title={title} description={description} action={action} role={null} className={className} />
  }
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 py-8' : 'gap-2 py-14', className)}>
      {Icon && (
        <span className="mb-1 flex size-11 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-500">
          <Icon size={20} aria-hidden />
        </span>
      )}
      <p className={typography.h3}>{title}</p>
      {description && <p className={clsx('max-w-sm', typography.small)}>{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
