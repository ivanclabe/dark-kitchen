import clsx from 'clsx'
import type { ComponentType, ReactNode } from 'react'
import { cardClass } from './formClasses'
import { typography } from './typography'

export function Card({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = '',
  padding = true,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ size?: number; className?: string }>
  action?: ReactNode
  children: ReactNode
  className?: string
  /** false para contenido edge-to-edge (tablas, listas) — el header conserva su padding. */
  padding?: boolean
}) {
  return (
    <section className={clsx(cardClass, !padding && '!p-0', className)}>
      {(title || action) && (
        <div className={clsx('flex items-start justify-between gap-3', padding ? 'mb-4' : 'border-b border-neutral-800/60 px-5 py-4')}>
          <div className="min-w-0">
            {title && (
              <h3 className={clsx('flex items-center gap-2', typography.h3)}>
                {Icon && <Icon size={15} className="text-neutral-500" aria-hidden />}
                {title}
              </h3>
            )}
            {description && <p className={clsx('mt-0.5', typography.caption)}>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
