import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'
import { typography } from './typography'

/**
 * Numbered pagination for lists paged in the database (ADR 0028):
 * "Mostrando 26–50 de 1.284" and previous/next. Hidden when everything fits.
 */
export function Pagination({ page, pageSize, total, onPage, label = 'resultados' }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize && page === 0) return null
  const first = page * pageSize + 1
  const last = Math.min(total, (page + 1) * pageSize)
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3">
      <p className={typography.small}>
        Mostrando <span className="tabular-nums text-neutral-200">{first.toLocaleString('es-CO')}–{last.toLocaleString('es-CO')}</span> de{' '}
        <span className="tabular-nums text-neutral-200">{total.toLocaleString('es-CO')}</span> {label}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Página anterior">
          Anterior
        </Button>
        <span className="text-sm tabular-nums text-neutral-400">
          {page + 1} de {pages}
        </span>
        <Button variant="secondary" size="sm" iconRight={ChevronRight} onClick={() => onPage(page + 1)} disabled={page + 1 >= pages} aria-label="Página siguiente">
          Siguiente
        </Button>
      </div>
    </nav>
  )
}
