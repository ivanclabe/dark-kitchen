import clsx from 'clsx'
import { useRef, type ComponentType, type KeyboardEvent } from 'react'
import { NavLink } from 'react-router-dom'

export interface SubNavItem<T extends string> {
  value: T
  label: string
  /** Optional icon before the label (Operación: each view, recognised at a glance on a kitchen tablet). */
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
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
            {item.icon ? (
              <span className="inline-flex items-center gap-1.5">
                <item.icon size={14} className={active ? 'text-brasa-400' : 'text-neutral-500'} aria-hidden />
                {item.label}
              </span>
            ) : (
              item.label
            )}
          </button>
        )
      })}
    </div>
  )
}

export interface SubNavLink {
  /** Absolute path (already inside the account). */
  to: string
  label: string
  /** Active only on this exact path (for the first section, whose path is the parent of the others). */
  end?: boolean
}

/**
 * The same underlined bar when each section is its own address
 * (Configuración, Usuarios): links instead of tabs, the look of Abastecimiento (ADR 0032).
 */
export function SubNavLinks({ items, label }: { items: SubNavLink[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-5 overflow-x-auto border-b border-neutral-800 [scrollbar-width:none]">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              '-mb-px shrink-0 border-b-2 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
              isActive ? 'border-brasa-500 text-neutral-50' : 'border-transparent text-neutral-400 hover:text-neutral-200',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
