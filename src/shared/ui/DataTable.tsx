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
          {emptyState ?? <EmptyState title="Sin resultados" compact />}
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
        className={clsx(onRowClick && 'cursor-pointer focus-visible:bg-neutral-900/60 focus-visible:outline-none', rowClassName?.(row))}
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
      <table className="min-w-full">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={clsx(thClass, ALIGN[col.align ?? 'left'], col.hideBelow && HIDE[col.hideBelow])}>
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
