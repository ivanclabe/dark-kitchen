import clsx from 'clsx'
import { useRef, type KeyboardEvent } from 'react'

export interface SubNavItem<T extends string> {
  value: T
  label: string
}

/**
 * Secondary navigation of a settings section (ADR 0026, D1): text tabs with
 * an underline, smaller and lighter than the main navigation so they never
 * compete with it. Real ARIA tabs (arrows ←/→ move the selection).
 */
export function SubNav<T extends string>({ items, value, onChange, label }: { items: SubNavItem<T>[]; value: T; onChange: (value: T) => void; label: string }) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const index = items.findIndex((i) => i.value === value)
    const next = items[(index + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]
    onChange(next.value)
    refs.current[next.value]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-5 overflow-x-auto border-b border-neutral-800 [scrollbar-width:none]">
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[item.value] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={clsx(
              // Same weight active or not: the tabs never change width (no sideways jump).
              '-mb-px shrink-0 border-b-2 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
              active ? 'border-brasa-500 text-neutral-50' : 'border-transparent text-neutral-400 hover:text-neutral-200',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
