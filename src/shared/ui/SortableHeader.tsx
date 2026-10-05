import clsx from 'clsx'
import { ArrowDown, ArrowUp } from 'lucide-react'

export type SortDir = 'asc' | 'desc'

/** A column header that sorts the table (aria-sort lives on the button label). */
export function SortableHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  align = 'left',
}: {
  label: string
  column: K
  sort: { key: K; dir: SortDir }
  onSort: (key: K) => void
  align?: 'left' | 'right'
}) {
  const active = sort.key === column
  const Icon = sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Ordenar por ${label}${active ? (sort.dir === 'asc' ? ', ascendente' : ', descendente') : ''}`}
      className={clsx('inline-flex items-center gap-1 uppercase hover:text-neutral-200', align === 'right' && 'flex-row-reverse', active && 'text-neutral-200')}
    >
      {label}
      <Icon size={12} className={active ? 'opacity-100' : 'opacity-0'} aria-hidden />
    </button>
  )
}
