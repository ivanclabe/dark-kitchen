import { useAuth } from '@/shared/hooks/useAuth'
import { useToast } from '@/shared/ui/Toast'
import { BrandLogo } from '@/shared/brand/BrandMark'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { helpHref } from '@/shared/help/helpUrl'
import clsx from 'clsx'
import { ArrowRight, Loader2, LogOut, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const LANDING_SECTIONS = [
  { id: 'producto', label: 'Producto' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'precios', label: 'Precios' },
  { id: 'faq', label: 'FAQ' },
] as const

/**
 * Sign out from the landing: only this app on this device. While it closes, the button
 * says so; then a toast confirms it (or says why it could not).
 */
function useLandingSignOut() {
  const { signOut } = useAuth()
  const { show } = useToast()
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    const result = await signOut()
    setBusy(false)
    if (result?.error) show(result.error, 'error')
    else show('Cerraste sesión. Puedes entrar con otra cuenta o crear una nueva.', 'success')
  }
  return { busy, run }
}

/**
 * Navegación de la landing (ADR 0010, 3.5; ADR 0068): Producto · Funcionalidades · Precios · FAQ · Ayuda
 * (doc.quanela.com, ADR 0035) · la sesión. Una barra lisa a todo lo ancho: el logo, las secciones y la sesión.
 * Donde las secciones no caben (menos de 1280 px), van en un panel que flota bajo la barra, con lo que la barra no
 * muestra: nada se repite.
 */
export function LandingNav() {
  // The session is shown only once Supabase confirmed it (useAuth verifies it with the server).
  const { session, loading } = useAuth()
  const signOut = useLandingSignOut()
  const [open, setOpen] = useState(false)
  // The panel closes with Escape, like any menu.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const link = 'whitespace-nowrap rounded-full px-3 py-2 text-[15px] text-[#5B4A42] transition-colors hover:bg-[#1C1310]/[0.05] hover:text-[#1C1310]'
  const row = 'flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[17px] text-[#1C1310] transition-colors hover:bg-[#F3F2F0]'

  return (
    // Always solid: the headline scrolls under it and must never show through.
    <header className="fixed inset-x-0 top-0 z-30 bg-white">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
        <a href="#producto" className="flex shrink-0 items-center" aria-label="Quanela — inicio" onClick={() => setOpen(false)}>
          <BrandLogo className="h-11" />
        </a>

        <nav aria-label="Secciones" className="mx-auto hidden items-center gap-0.5 xl:flex">
          {LANDING_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={link}>
              {s.label}
            </a>
          ))}
          <a href={helpHref()} className={link}>
            Ayuda
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          {loading ? (
            // Same width as the buttons that come: nothing jumps when the session is confirmed.
            <span role="status" aria-label="Comprobando tu sesión" className="inline-flex h-9 w-36 items-center justify-center text-[#5B4A42]">
              <Loader2 size={16} className="animate-spin" aria-hidden />
            </span>
          ) : session ? (
            <>
              <button
                type="button"
                onClick={() => void signOut.run()}
                disabled={signOut.busy}
                className="hidden items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[15px] text-[#5B4A42] transition-colors hover:text-[#1C1310] disabled:opacity-60 sm:inline-flex"
              >
                {signOut.busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}
                {signOut.busy ? 'Cerrando…' : 'Cerrar sesión'}
              </button>
              <Link to={APP_ENTRY} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#1C1310] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3B2C26]">
                Ir a mi cuenta <ArrowRight size={16} aria-hidden />
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="hidden whitespace-nowrap rounded-full px-3 py-2 text-[15px] text-[#5B4A42] transition-colors hover:text-[#1C1310] sm:block">
                Iniciar sesión
              </Link>
              <Link
                to="/registro"
                className="inline-flex items-center whitespace-nowrap rounded-full bg-[#1C1310] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3B2C26]"
              >
                Crear cuenta
              </Link>
            </>
          )}
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-[#1C1310] transition-colors hover:bg-[#F3F2F0] xl:hidden"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      {/* The panel floats under the bar over a dimmed page; touching outside closes it. */}
      <div className={clsx('xl:hidden', open ? 'block' : 'hidden')}>
        <div className="fixed inset-x-0 top-16 bottom-0 bg-[#1C1310]/25" aria-hidden onClick={() => setOpen(false)} />
        <nav
          id="landing-mobile-nav"
          aria-label="Secciones"
          className={'landing-menu-panel absolute top-[calc(100%+8px)] right-3 left-3 rounded-[24px] bg-white p-2 shadow-[0_24px_60px_-16px_rgba(28,19,16,0.35)] sm:left-auto sm:w-80' /* taste-skill-ignore: a menu that floats */}
        >
          {LANDING_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={() => setOpen(false)} className={row}>
              {s.label}
            </a>
          ))}
          <a href={helpHref()} onClick={() => setOpen(false)} className={row}>
            Ayuda
          </a>
          {/* On phones the bar only has room for the main action: the other session action lives here. */}
          {!loading && !session && (
            <Link to="/login" className={clsx(row, 'mt-1 bg-[#F3F2F0] sm:hidden')}>
              Iniciar sesión
            </Link>
          )}
          {!loading && session && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                void signOut.run()
              }}
              disabled={signOut.busy}
              className={clsx(row, 'mt-1 bg-[#F3F2F0] sm:hidden')}
            >
              <LogOut size={18} aria-hidden /> Cerrar sesión
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}
