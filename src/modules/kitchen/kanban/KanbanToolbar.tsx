import { Chip } from '@/shared/ui/Chip'
import { inputClass } from '@/shared/ui/formClasses'
import { Search } from 'lucide-react'

export function KanbanToolbar({
  search,
  onSearchChange,
  onlyPriority,
  onTogglePriority,
  onlyAlert,
  onToggleAlert,
}: {
  search: string
  onSearchChange: (value: string) => void
  onlyPriority: boolean
  onTogglePriority: () => void
  onlyAlert: boolean
  onToggleAlert: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar # o cliente…"
          className={`${inputClass} !mt-0 w-52 pl-9`}
        />
      </div>
      <Chip label="Prioritarios" active={onlyPriority} onClick={onTogglePriority} />
      <Chip label="Con alerta" active={onlyAlert} onClick={onToggleAlert} />
    </div>
  )
}
