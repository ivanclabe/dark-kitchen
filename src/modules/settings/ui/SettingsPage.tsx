import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * One section of Configuración (ADR 0026): the same header (title,
 * description, main action on the right), an optional secondary navigation
 * and the content, at the full width like every screen (ADR 0032).
 */
export function SettingsPage({
  title,
  description,
  actions,
  subNav,
  narrow = false,
  children,
}: {
  title: string
  description: ReactNode
  actions?: ReactNode
  subNav?: ReactNode
  /** A form of short fields: the content keeps a reading width instead of stretching every field across the screen. */
  narrow?: boolean
  children: ReactNode
}) {
  return (
    <div className="w-full min-w-0">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {/* The bar of sections already says where you are (ADR 0032, like Abastecimiento): the title is for screen readers. */}
          <h2 className="sr-only">{title}</h2>
          {/* Two lines reserved on phones, so a short description and a long one start the content at the same height. */}
          <p className={clsx('min-h-10 sm:min-h-0', typography.small)}>{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {subNav && <div className="mb-6">{subNav}</div>}
      <div className={clsx('space-y-8', narrow && 'max-w-3xl')}>{children}</div>
    </div>
  )
}
