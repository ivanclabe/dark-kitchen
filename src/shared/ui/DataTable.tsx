import clsx from 'clsx'
import type { KeyboardEvent, ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { tableWrapperClass, tbodyClass, tdClass, thClass } from './formClasses'
import { LoadingState } from './LoadingState'

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  /** Clases extra para la celda (ancho, truncado). */
  className?: string
  /** Oculta la columna por debajo de este breakpoint — la información secundaria no compite en móvil. */
  hideBelow?: 'sm' | 'md' | 'lg'
  /** Column width in `layout="fixed"` (e.g. 'w-32', 'w-[20%]'); without it the column shares the rest. */
  width?: string
}

const HIDE: Record<NonNullable<DataTableColumn<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

/**
 * Tabla del Design System: header diferenciado, hover de fila, filas
 * clickeables accesibles por teclado, y estados loading/empty/error
 * integrados (antes 8 tablas no tenían empty state y ninguna manejaba
 * errores). Columnas con `hideBelow` desaparecen en pantallas chicas.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  rowClassName,
  isLoading = false,
  error,
  onRetry,
  emptyState,
  footer,
  layout = 'auto',
  className,
}: {
  columns: DataTableColumn<T>[]
  rows: T[] | undefined
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  emptyState?: ReactNode
  footer?: ReactNode
  /**
   * ADR 0065: 'fixed' gives each column its `width` and lets `truncate` work in the cells —
   * with the auto layout a long name pushes the other columns out of view.
   */
  layout?: 'auto' | 'fixed'
  className?: string
}) {
  const colCount = columns.length

  function handleRowKey(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowClick(row)
    }
  }

  let body: ReactNode
  if (error) {
    body = (
      <tr>
        <td colSpan={colCount} className="p-3">
          <ErrorState error={error} onRetry={onRetry} compact />
        </td>
      </tr>
    )
  } else if (isLoading) {
    body = (
      <tr>
        <td colSpan={colCount} className="p-0">
          <LoadingState variant="rows" rows={4} cols={Math.min(colCount, 4)} />
        </td>
      </tr>
    )
  } else if (!rows || rows.length === 0) {
    body = (
      <tr>
        <td colSpan={colCount} className="p-0">
          {emptyState ?? <EmptyState title="Sin resultados" compact mood="noResults" />}
        </td>
      </tr>
    )
  } else {
    body = rows.map((row) => (
      <tr
        key={getRowId(row)}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onKeyDown={onRowClick ? (e) => handleRowKey(e, row) : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        role={onRowClick ? 'button' : undefined}
        className={clsx(
          onRowClick &&
            'cursor-pointer focus-visible:bg-neutral-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
          rowClassName?.(row),
        )}
      >
        {columns.map((col) => (
          <td key={col.key} className={clsx(tdClass, ALIGN[col.align ?? 'left'], col.hideBelow && HIDE[col.hideBelow], col.className)}>
            {col.cell(row)}
          </td>
        ))}
      </tr>
    ))
  }

  return (
    <div className={clsx(tableWrapperClass, className)}>
      <table className={clsx('min-w-full', layout === 'fixed' && 'w-full table-fixed')}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={clsx(thClass, ALIGN[col.align ?? 'left'], col.hideBelow && HIDE[col.hideBelow], col.width)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={tbodyClass}>{body}</tbody>
        {footer && <tfoot className="border-t border-neutral-800">{footer}</tfoot>}
      </table>
    </div>
  )
}
