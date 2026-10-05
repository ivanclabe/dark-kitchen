import { PageHeader } from './PageHeader'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

export interface SectionLink {
  /** Absolute path (already inside the account). */
  to: string
  label: string
  icon: LucideIcon
  /** Active only on this exact path (for the first section, whose path is the parent of the others). */
  end?: boolean
}

/**
 * The shell of an administration area of the account (ADR 0026): one header,
 * one navigation and one content column. Configuración and Usuarios use it,
 * so moving between their sections feels like the same place. Wide screens:
 * a vertical list that stays in view; phones and tablets: a neutral bar.
 */
export function SectionLayout({
  title,
  description,
  icon,
  navLabel,
  sections,
  children,
}: {
  title: string
  description: ReactNode
  /** The icon of the area, the same as in the rail (ADR 0029). */
  icon: LucideIcon
  navLabel: string
  sections: SectionLink[]
  children: ReactNode
}) {
  const { pathname, search } = useLocation()
  const root = useRef<HTMLDivElement>(null)
  // A new section (or sub-section) starts at the top: otherwise a shorter page clamps the scroll and the header lands elsewhere.
  useEffect(() => {
    root.current?.closest('main')?.scrollTo({ top: 0 })
  }, [pathname, search])

  return (
    <div ref={root} className="mx-auto w-full max-w-6xl">
      <div className="mb-6 lg:mb-8">
        <PageHeader title={title} description={description} icon={icon} />
      </div>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        {sections.length > 1 && (
          <nav aria-label={navLabel} className="mb-6 lg:mb-0">
            {/* Phones and tablets: a neutral bar that scrolls inside its own width. Same weight active or not: no sideways jump. */}
            <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
              {sections.map((s) => (
                <li key={s.to} className="shrink-0">
                  <NavLink
                    to={s.to}
                    end={s.end}
                    className={({ isActive }) =>
                      clsx(
                        'block rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
                        isActive ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
                      )
                    }
                  >
                    {s.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            {/* Wide screens: a vertical list that stays in view. */}
            <ul className="hidden space-y-0.5 lg:sticky lg:top-0 lg:block">
              {sections.map((s) => {
                const Icon = s.icon
                return (
                  <li key={s.to}>
                    <NavLink
                      to={s.to}
                      end={s.end}
                      className={({ isActive }) =>
                        clsx(
                          'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
                          isActive
                            ? 'bg-neutral-800/70 text-neutral-50 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brasa-500'
                            : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
                        )
                      }
                    >
                      <Icon size={16} className="shrink-0" aria-hidden />
                      {s.label}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </nav>
        )}
        <div className={clsx('min-w-0', sections.length === 1 && 'lg:col-span-2')}>{children}</div>
      </div>
    </div>
  )
}
