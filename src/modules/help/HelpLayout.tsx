import { useAuth } from '@/shared/hooks/useAuth'
import { Drawer } from '@/shared/ui/Drawer'
import clsx from 'clsx'
import { ChevronRight, Flame, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { HelpSearch } from './components/HelpSearch'
import './help.css'
import { helpPath } from '@/shared/help/helpUrl'
import { appHomeHref, articlesOf, HELP_SECTIONS } from './lib'

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { section: current } = useParams<{ section?: string }>()
  const [toggled, setToggled] = useState<Set<string>>(() => new Set(current ? [current] : ['intro', 'getting-started']))
  // The section on screen is always open (derived, not copied into state).
  const openSections = current && !toggled.has(`-${current}`) ? new Set([...toggled, current]) : toggled
  const toggle = (id: string) =>
    setToggled((s) => {
      const next = new Set(s)
      if (openSections.has(id)) {
        next.delete(id)
        if (id === current) next.add(`-${id}`)
      } else {
        next.add(id)
        next.delete(`-${id}`)
      }
      return next
    })

  return (
    <nav aria-label="Secciones de la ayuda" className="space-y-1 text-sm">
      {HELP_SECTIONS.map((section) => {
        const open = openSections.has(section.id)
        return (
          <div key={section.id}>
            <button
              type="button"
              onClick={() => toggle(section.id)}
              aria-expanded={open}
              className={clsx(
                'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-medium transition-colors hover:bg-neutral-900',
                current === section.id ? 'text-neutral-50' : 'text-neutral-300',
              )}
            >
              <ChevronRight size={14} className={clsx('shrink-0 text-neutral-500 transition-transform', open && 'rotate-90')} aria-hidden />
              {section.title}
            </button>
            {open && (
              <ul className="mt-0.5 mb-2 ml-4 space-y-0.5 border-l border-neutral-800 pl-2">
                {articlesOf(section).map((a) => (
                  <li key={a.id}>
                    <NavLink
                      to={helpPath(a.url)}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        clsx('block rounded-md px-2 py-1 transition-colors', isActive ? 'bg-brasa-500/10 text-brasa-300' : 'text-neutral-400 hover:text-neutral-100')
                      }
                    >
                      {a.title}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/**
 * The public help center of Quanela (ADR 0034), without signing in: a wiki
 * menu on the side, the search on top, the article in the middle. The same
 * look as the app; on a phone the menu opens from ☰.
 */
export function HelpLayout() {
  const { session } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname, hash } = useLocation()

  // A new article starts at the top (or at its anchor).
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
    else window.scrollTo({ top: 0 })
  }, [pathname, hash])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-neutral-900 focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b border-neutral-800/60 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir el menú de la ayuda"
            className="-ml-1 flex size-10 items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-900 lg:hidden"
          >
            <Menu size={20} aria-hidden />
          </button>
          <Link to={helpPath()} className="flex shrink-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brasa-500">
              <Flame size={16} className="text-white" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="text-sm font-semibold">
              Quanela <span className="hidden font-normal text-neutral-400 sm:inline">· Centro de ayuda</span>
            </span>
          </Link>
          <div className="mx-auto hidden w-full max-w-md md:block">
            <HelpSearch />
          </div>
          <a
            href={appHomeHref(Boolean(session))}
            className="ml-auto shrink-0 rounded-full border border-neutral-800 px-3.5 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-900 md:ml-0"
          >
            {session ? 'Volver a Quanela' : 'Entrar'}
          </a>
        </div>
        <div className="px-4 pb-3 md:hidden">
          <HelpSearch />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 lg:px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto py-6 pr-2 lg:block">
          <SideNav />
        </aside>
        <main id="contenido" className="min-w-0 flex-1 py-8">
          <Outlet />
        </main>
      </div>

      {menuOpen && (
        <Drawer open onClose={() => setMenuOpen(false)} title="Centro de ayuda" side="left" size="sm">
          <SideNav onNavigate={() => setMenuOpen(false)} />
        </Drawer>
      )}
    </div>
  )
}
