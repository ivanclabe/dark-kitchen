import { cardClass } from '@/shared/ui/formClasses'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * A group inside a settings section (ADR 0026): title (h3), short
 * description and its content. `card` frames the content when it is a block
 * of its own (a form, a summary); lists and tables already have their frame.
 * `tone="danger"` is the "Zona de peligro".
 */
export function SettingsSection({
  title,
  description,
  actions,
  card = false,
  tone = 'default',
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  card?: boolean
  tone?: 'default' | 'danger'
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className={clsx(typography.h3, tone === 'danger' && '!text-red-300')}>{title}</h3>
          {description && <p className={clsx('mt-0.5', typography.caption)}>{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {card ? <div className={clsx(cardClass, tone === 'danger' && '!border-red-500/30')}>{children}</div> : children}
    </section>
  )
}
