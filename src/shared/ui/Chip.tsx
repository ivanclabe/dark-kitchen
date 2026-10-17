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
    <button type="button" onClick={onClick} aria-pressed={active} title={label} className={chipClass(active)}>
      {/* A long category name truncates instead of running off a phone screen. */}
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && (
        <span className={`shrink-0 rounded-full px-1.5 text-2xs tabular-nums ${active ? 'bg-neutral-950/15' : 'bg-neutral-800 text-neutral-300'}`}>{count}</span>
      )}
    </button>
  )
}
