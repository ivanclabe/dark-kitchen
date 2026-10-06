import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * The one page container of the app (ADR 0029, ADR 0032). Every screen has
 * the layout of Abastecimiento: the full width of <main>, aligned to the
 * left, the header on top and the blocks 1.5rem apart. Only the height
 * changes:
 *   board    full height, the content scrolls inside — boards and master-detail (Operación, Catálogo, Abastecimiento, Personal)
 *   default  the page scrolls — everything else
 * The page margins are <main>'s (AppLayout).
 */
export type PageVariant = 'board' | 'default'

const VARIANT: Record<PageVariant, string> = {
  board: 'flex h-full min-h-0 w-full flex-col gap-6',
  default: 'w-full space-y-6',
}

export function Page({ variant = 'default', className, children }: { variant?: PageVariant; className?: string; children: ReactNode }) {
  return <div className={clsx(VARIANT[variant], className)}>{children}</div>
}
