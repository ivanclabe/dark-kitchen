import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * The one page container of the app (ADR 0029). The width and the spacing
 * between the header and the blocks live here, never in each screen:
 *   board    full width and full height — boards and calendars (Pedidos, Cocina, Catálogo, Abastecimiento, Personal)
 *   default  max-w-6xl, centered — everything else
 *   narrow   max-w-3xl, centered — personal forms (Mi perfil, Mis turnos)
 * The page margins are <main>'s (AppLayout).
 */
export type PageVariant = 'board' | 'default' | 'narrow'

const VARIANT: Record<PageVariant, string> = {
  board: 'flex h-full min-h-0 w-full flex-col gap-6',
  default: 'mx-auto w-full max-w-6xl space-y-6',
  narrow: 'mx-auto w-full max-w-3xl space-y-6',
}

export function Page({ variant = 'default', className, children }: { variant?: PageVariant; className?: string; children: ReactNode }) {
  return <div className={clsx(VARIANT[variant], className)}>{children}</div>
}
