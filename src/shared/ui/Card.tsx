import type { ComponentType, ReactNode } from 'react'
import { cardClass } from './formClasses'

export function Card({
  title,
  icon: Icon,
  action,
  children,
  className = '',
}: {
  title?: string
  icon?: ComponentType<{ size?: number; className?: string }>
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`${cardClass} ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <h2 className="flex items-center gap-1.5 font-medium text-neutral-100">
              {Icon && <Icon size={15} className="text-neutral-500" />}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
