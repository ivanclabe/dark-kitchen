import { useAuth } from '@/shared/hooks/useAuth'
import { useToast } from '@/shared/ui/Toast'
import { BrandWordmark } from '@/shared/brand/BrandMark'
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

/** The section being read: the last one whose top has passed under the bar. */
function useActiveSection(): string {
  const [active, setActive] = useState<string>(LANDING_SECTIONS[0].id)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let current: string = LANDING_SECTIONS[0].id
      for (const s of LANDING_SECTIONS) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= 140) current = s.id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])
  return active
}

/**
 * Navegación de la landing (ADR 0010, 3.5; ADR 0068): Producto · Funcionalidades · Precios · FAQ · Ayuda
 * (doc.quanela.com, ADR 0035) · la sesión. Una barra que flota separada de los bordes, con esquinas redondeadas:
 * el logo, las secciones al centro (la que se está leyendo, en ember y subrayada en el borde de la barra) y la
 * sesión, con «Crear cuenta» en el color de la acción. Donde las secciones no caben (menos de 1280 px) van en un
 * panel bajo la barra, con lo que la barra no muestra: nada se repite.
 */
export function LandingNav() {
  // The session is shown only once Supabase confirmed it (useAuth verifies it with the server).
  const { session, loading } = useAuth()
  const signOut = useLandingSignOut()
  const active = useActiveSection()
  const [open, setOpen] = useState(false)
  // The panel closes with Escape, like any menu.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const row = 'flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[17px] text-[#1C1310] transition-colors hover:bg-[#F3F2F0]'
  const action = 'inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-[15px] font-semibold transition-colors'

  return (
    <header className="fixed inset-x-3 top-3 z-30 sm:inset-x-4">
      {/* Behind the panel, the page dims; touching it closes the panel. */}
      {open && <div className="fixed inset-0 bg-[#1C1310]/25 xl:hidden" aria-hidden onClick={() => setOpen(false)} />}

      <div className="relative flex h-16 items-center gap-4 rounded-[18px] border border-[#1C1310]/10 bg-white pr-2 pl-4 sm:pl-5">
        <a href="#producto" className="flex shrink-0 items-center" aria-label="Quanela — inicio" onClick={() => setOpen(false)}>
          <BrandWordmark className="h-7" color="bg-[var(--l-ink)]" />
        </a>

        <nav aria-label="Secciones" className="absolute inset-y-0 left-1/2 hidden -translate-x-1/2 items-stretch gap-1 xl:flex">
          {LANDING_SECTIONS.map((s) => {
            const current = s.id === active
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                aria-current={current ? 'location' : undefined}
                className={clsx(
                  'relative flex items-center px-3.5 text-[15px] whitespace-nowrap transition-colors',
                  current ? 'font-semibold text-[#C2410C]' : 'text-[#3B2C26] hover:text-[#1C1310]',
                )}
              >
                {s.label}
                {/* The mark of the section being read sits on the bar's bottom edge. */}
                <span className={clsx('absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#C2410C] transition-opacity duration-200', current ? 'opacity-100' : 'opacity-0')} aria-hidden />
              </a>
            )
          })}
          <a href={helpHref()} className="flex items-center px-3.5 text-[15px] whitespace-nowrap text-[#3B2C26] transition-colors hover:text-[#1C1310]">
            Ayuda
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {loading ? (
            // Same width as the buttons that come: nothing jumps when the session is confirmed.
            <span role="status" aria-label="Comprobando tu sesión" className="inline-flex h-10 w-36 items-center justify-center text-[#5B4A42]">
              <Loader2 size={16} className="animate-spin" aria-hidden />
            </span>
          ) : session ? (
            <>
              <button
                type="button"
                onClick={() => void signOut.run()}
                disabled={signOut.busy}
                className={clsx(action, 'font-normal text-[#5B4A42] hover:bg-[#F3F2F0] hover:text-[#1C1310] disabled:opacity-60 max-sm:hidden')}
              >
                {signOut.busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}
                {signOut.busy ? 'Cerrando…' : 'Cerrar sesión'}
              </button>
              <Link to={APP_ENTRY} className={clsx(action, 'bg-[#C2410C] text-white hover:bg-[#9A3412]')}>
                Ir a mi cuenta <ArrowRight size={16} aria-hidden />
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className={clsx(action, 'font-normal text-[#5B4A42] hover:bg-[#F3F2F0] hover:text-[#1C1310] max-sm:hidden')}>
                Iniciar sesión
              </Link>
              <Link to="/registro" className={clsx(action, 'bg-[#C2410C] text-white hover:bg-[#9A3412]')}>
                Crear cuenta
              </Link>
            </>
          )}
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl text-[#1C1310] transition-colors hover:bg-[#F3F2F0] xl:hidden"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      <nav
        id="landing-mobile-nav"
        aria-label="Secciones"
        className={clsx(
          'landing-menu-panel absolute top-[calc(100%+8px)] right-0 left-0 rounded-[18px] border border-[#1C1310]/10 bg-white p-2 sm:left-auto sm:w-80 xl:hidden',
          open ? 'block' : 'hidden',
        )}
      >
        {LANDING_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => setOpen(false)}
            aria-current={s.id === active ? 'location' : undefined}
            className={clsx(row, s.id === active && 'font-semibold text-[#C2410C]')}
          >
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
    </header>
  )
}
