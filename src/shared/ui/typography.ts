/**
 * Escala tipográfica del Design System. Un solo lugar para la jerarquía —
 * las páginas no deberían inventar tamaños (`text-2xl` acá, `text-xl` allá).
 *
 *   display  — cifras grandes (KPI principal)
 *   h1       — título de página (PageHeader)
 *   h2       — título de sección dentro de una página
 *   h3       — título de card / bloque
 *   body     — texto por defecto
 *   small    — texto secundario
 *   caption  — metadatos, pies de tabla
 *   overline — encabezados de sección en mayúsculas
 *   label    — etiquetas de formulario y de columna
 */
export const typography = {
  display: 'text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl',
  h1: 'text-2xl font-semibold tracking-tight text-neutral-50',
  h2: 'text-lg font-semibold text-neutral-50',
  h3: 'text-sm font-semibold text-neutral-100',
  body: 'text-sm text-neutral-200',
  small: 'text-sm text-neutral-400',
  caption: 'text-xs text-neutral-500',
  overline: 'text-[11px] font-semibold uppercase tracking-wider text-neutral-500',
  label: 'text-xs font-medium uppercase tracking-wide text-neutral-500',
} as const
