import { BrandMark } from '@/shared/brand/BrandMark'
import { QUANELA_DOCUMENTS, legalHref } from '@/shared/legal/documents'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import '../legal.css'

/** Public shell of the legal documents (ADR 0071): readable without a session, on any host and on a phone. */
export function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100">
      <header className="legal-no-print border-b border-neutral-800/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-neutral-100">
            <BrandMark className="size-8" />
            <span className="font-semibold">Quanela</span>
          </Link>
          <Link to="/legal" className="text-sm text-neutral-400 hover:text-neutral-100">
            Documentos legales
          </Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-5xl gap-10 px-4 py-8 sm:px-6 sm:py-10">
        <nav aria-label="Documentos legales" className="legal-no-print hidden w-56 shrink-0 lg:block">
          <ul className="sticky top-8 space-y-0.5 text-sm">
            {QUANELA_DOCUMENTS.map((doc) => (
              <li key={doc.slug}>
                <NavLink
                  to={legalHref(doc.slug)}
                  className={({ isActive }) =>
                    clsx('block rounded-lg px-3 py-1.5 transition-colors', isActive ? 'bg-brasa-500/10 text-brasa-300' : 'text-neutral-400 hover:text-neutral-100')
                  }
                >
                  {doc.title}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink
                to="/legal/preferencias"
                className={({ isActive }) =>
                  clsx('block rounded-lg px-3 py-1.5 transition-colors', isActive ? 'bg-brasa-500/10 text-brasa-300' : 'text-neutral-400 hover:text-neutral-100')
                }
              >
                Preferencias de privacidad
              </NavLink>
            </li>
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <footer className="legal-no-print border-t border-neutral-800/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-neutral-500 sm:px-6">
          <span>© {new Date().getFullYear()} Quanela</span>
          <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-300">
            Superintendencia de Industria y Comercio
          </a>
        </div>
      </footer>
    </div>
  )
}
