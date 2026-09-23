import { useRef, type ComponentType, type KeyboardEvent } from 'react'

export interface TabItem<T extends string> {
  value: T
  label: string
  icon?: ComponentType<{ size?: number }>
}

/**
 * Selector de vistas tipo segmented control, con semántica ARIA de tabs real
 * (role="tablist"/"tab", roving tabindex, flechas ←/→ mueven selección y
 * foco) — no solo un grupo de botones.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (value: T) => void
  items: TabItem<T>[]
}) {
  const buttonRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})

  function focusAndSelect(nextValue: T) {
    onChange(nextValue)
    buttonRefs.current[nextValue]?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = items.findIndex((item) => item.value === value)
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = items[(currentIndex + 1) % items.length]
      if (next) focusAndSelect(next.value)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = items[(currentIndex - 1 + items.length) % items.length]
      if (prev) focusAndSelect(prev.value)
    }
  }

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className="inline-flex items-center gap-1 rounded-full border border-neutral-800/60 bg-neutral-900/60 p-1"
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              buttonRefs.current[item.value] = el
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500 ${
              active ? 'bg-brasa-500 text-white' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {Icon && <Icon size={15} />}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
