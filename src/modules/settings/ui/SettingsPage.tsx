import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * One section of Configuración (ADR 0026): the same header (title,
 * description, main action on the right), an optional secondary navigation
 * and the content, always with the same width. `wide` exists for a table that
 * needs it; no section uses it today.
 */
export function SettingsPage({
  title,
  description,
  actions,
  subNav,
  wide = false,
  children,
}: {
  title: string
  description: ReactNode
  actions?: ReactNode
  subNav?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={clsx('w-full min-w-0', wide ? 'max-w-6xl' : 'max-w-4xl')}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className={typography.h2}>{title}</h2>
          {/* Two lines reserved on phones, so a short description and a long one start the content at the same height. */}
          <p className={clsx('mt-1 min-h-10 sm:min-h-0', typography.small)}>{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {subNav && <div className="mb-6">{subNav}</div>}
      <div className="space-y-8">{children}</div>
    </div>
  )
}
