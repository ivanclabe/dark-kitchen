import { buttonClass } from './Button'
import { typography } from './typography'

// Fachada de clases compartidas. Los botones derivan de Button.tsx (única
// fuente de verdad de la jerarquía de acciones); las páginas pueden usar
// estas constantes en <Link>/<label> o migrar al componente <Button>.
export const labelClass = `block ${typography.label}`
export const inputClass =
  'mt-1.5 w-full min-w-0 rounded-lg border border-neutral-600 bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-500 hover:border-neutral-500 focus:border-focus focus:ring-2 focus:ring-focus/25 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/20'
export const primaryButtonClass = buttonClass({ variant: 'primary' })
export const secondaryButtonClass = buttonClass({ variant: 'secondary' })
export const dangerButtonClass = buttonClass({ variant: 'danger' })
export const ghostButtonClass = buttonClass({ variant: 'ghost' })
/** Acción inline en celdas de tabla ("Ver", "Editar"). */
export const linkButtonClass = `inline-flex items-center gap-1 text-sm ${buttonClass({ variant: 'link' })}`
/** Botón circular para acciones secundarias de un solo ícono en toolbars/headers (config, sonido, etc.). */
export const iconButtonClass =
  'inline-flex size-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50'
export const cardClass = 'rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5 sm:p-6'
export const tableWrapperClass = 'relative overflow-x-auto rounded-2xl border border-neutral-800/60 bg-neutral-950'
export const thClass = `border-b border-neutral-800/80 bg-neutral-900/40 px-4 py-2.5 text-left ${typography.label} whitespace-nowrap`
export const tdClass = 'px-4 py-3 text-sm text-neutral-200 align-middle'
/** Clases del <tbody>: hover de fila + divisores hairline. */
export const tbodyClass = 'divide-y divide-neutral-800/70 [&>tr]:transition-colors [&>tr:hover]:bg-neutral-900/50'

/**
 * The selected chip, segment or tab: ink (the inverted neutral), not ember. A filter at rest is a
 * selection, not an action or a live state (DESIGN.md, The One Ember Rule); the neutral scale is
 * remapped per theme, so it inverts in dark, light and neutral alike.
 */
export const selectedFillClass = 'bg-neutral-100 text-neutral-950'

export const chipClass = (active: boolean) =>
  `inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus pointer-coarse:py-2 ${
    active
      ? selectedFillClass
      : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
  }`
