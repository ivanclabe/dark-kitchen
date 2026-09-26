import { useAuth } from '@/shared/hooks/useAuth'
import clsx from 'clsx'
import { Flame, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const LANDING_SECTIONS = [
  { id: 'producto', label: 'Producto' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'precios', label: 'Precios' },
  { id: 'faq', label: 'FAQ' },
] as const

/**
 * Navegación de la landing (ADR 0010, 3.5): Producto · Funcionalidades ·
 * Precios · FAQ · Iniciar sesión · Crear cuenta. Fija arriba; en el celular,
 * las secciones van en un menú desplegable.
 */
export function LandingNav() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-neutral-800/50 bg-neutral-950/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#producto" className="flex items-center gap-2.5" aria-label="Dark Kitchen — inicio" onClick={() => setOpen(false)}>
          <span className="flex size-8 items-center justify-center rounded-xl bg-brasa-500 shadow-[0_8px_24px_-8px_var(--color-brasa-500)]">
            <Flame size={16} className="text-white" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight">Dark Kitchen</span>
        </a>

        <nav aria-label="Secciones" className="hidden items-center gap-1 md:flex">
          {LANDING_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-100">
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {session ? (
            <Link to="/" className="rounded-lg bg-brasa-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brasa-400">
              Ir a mi cuenta
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:text-neutral-50 sm:block">
                Iniciar sesión
              </Link>
              <Link to="/registro" className="rounded-lg bg-brasa-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brasa-400">
                Crear cuenta
              </Link>
            </>
          )}
          <button
            type="button"
            className="rounded-lg p-2 text-neutral-300 hover:text-neutral-50 md:hidden"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      <nav id="landing-mobile-nav" aria-label="Secciones" className={clsx('border-t border-neutral-800/50 px-4 pb-4 md:hidden', open ? 'block' : 'hidden')}>
        {LANDING_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-base text-neutral-200 hover:bg-neutral-900">
            {s.label}
          </a>
        ))}
        {!session && (
          <Link to="/login" className="block rounded-lg px-2 py-3 text-base text-neutral-200 hover:bg-neutral-900">
            Iniciar sesión
          </Link>
        )}
      </nav>
    </header>
  )
}
