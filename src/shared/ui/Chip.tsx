import { chipClass } from './formClasses'

export function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={chipClass(active)}>
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-neutral-700'}`}>{count}</span>
      )}
    </button>
  )
}
