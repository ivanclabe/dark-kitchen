import { useAuth } from '@/shared/hooks/useAuth'
import { BrandLogo } from '@/shared/brand/BrandMark'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { helpHref } from '@/shared/help/helpUrl'
import clsx from 'clsx'
import { ArrowRight, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const LANDING_SECTIONS = [
  { id: 'producto', label: 'Producto' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'precios', label: 'Precios' },
  { id: 'faq', label: 'FAQ' },
] as const

/**
 * Navegación de la landing (ADR 0010, 3.5): Producto · Funcionalidades ·
 * Precios · FAQ · Ayuda (doc.quanela.com, ADR 0035) · Iniciar sesión · Crear cuenta.
 * Una barra a todo lo ancho: sobre el hero es transparente y, en pantallas anchas, sin logo (el hero ya lo muestra
 * en grande); al bajar toma fondo y muestra el logo. En el celular, las secciones van en un menú desplegable.
 */
export function LandingNav() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 120)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  const link = 'rounded-full px-3.5 py-2 text-[15px] text-[#5B4A42] transition-colors hover:bg-[#1C1310]/[0.05] hover:text-[#1C1310]'

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-30 border-b transition-colors duration-300',
        scrolled || open ? 'border-[#1C1310]/[0.07] bg-[#FDF7F1]/90 backdrop-blur-md' : 'border-transparent bg-[#FDF7F1]/80 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none',
      )}
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#producto" className="flex items-center gap-2.5" aria-label="Quanela — inicio" onClick={() => setOpen(false)}>
            <BrandLogo className={clsx('h-11 transition-opacity duration-300', !scrolled && 'lg:pointer-events-none lg:opacity-0')} />
          </a>

          <nav aria-label="Secciones" className="hidden items-center gap-0.5 md:flex">
            {LANDING_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={link}>
                {s.label}
              </a>
            ))}
            <a href={helpHref()} className={link}>
              Ayuda
            </a>
          </nav>

          <div className="flex items-center gap-2">
            {session ? (
              <Link to={APP_ENTRY} className="inline-flex items-center gap-1.5 rounded-full bg-[#1C1310] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3B2C26]">
                Ir a mi cuenta <ArrowRight size={16} aria-hidden />
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden rounded-full px-3.5 py-2 text-[15px] text-[#5B4A42] transition-colors hover:text-[#1C1310] sm:block">
                  Iniciar sesión
                </Link>
                <Link
                  to="/registro"
                  className="inline-flex items-center rounded-full bg-[#1C1310] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3B2C26]"
                >
                  Crear cuenta
                </Link>
              </>
            )}
            <button
              type="button"
              className="rounded-full p-2 text-[#5B4A42] hover:text-[#1C1310] md:hidden"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
              aria-controls="landing-mobile-nav"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          </div>
        </div>

        <nav id="landing-mobile-nav" aria-label="Secciones" className={clsx('border-t border-[#1C1310]/[0.07] px-3 pb-3 md:hidden', open ? 'block' : 'hidden')}>
          {LANDING_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-base text-[#3B2C26] hover:bg-[#1C1310]/[0.05]">
              {s.label}
            </a>
          ))}
          <a href={helpHref()} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-base text-[#3B2C26] hover:bg-[#1C1310]/[0.05]">
            Ayuda
          </a>
          {!session && (
            <Link to="/login" className="block rounded-lg px-2 py-3 text-base text-[#3B2C26] hover:bg-[#1C1310]/[0.05]">
              Iniciar sesión
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
