import type { ComponentType } from 'react'

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon size={28} className="text-neutral-700" />
      <p className="text-sm font-medium text-neutral-300">{title}</p>
      {description && <p className="max-w-xs text-xs text-neutral-500">{description}</p>}
    </div>
  )
}
