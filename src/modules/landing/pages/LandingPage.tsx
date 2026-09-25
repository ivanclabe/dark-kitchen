import { PUBLIC_SIGNUP_ENABLED } from '@/modules/signup/api'
import { useAuth } from '@/shared/hooks/useAuth'
import { CalendarDays, ChefHat, ChevronRight, Flame, Wallet, Warehouse, type LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { DeviceMockups } from '../components/DeviceMockups'
import { EmberField } from '../components/EmberField'

/** Todo lo que describe esta lista existe hoy en la app — nada de "próximamente" ni cifras inventadas. */
const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ChefHat,
    title: 'Cocina en tiempo real',
    body: 'Un solo tablero del pedido a la entrega, con alertas de tiempo, control por plato y comandos de voz.',
  },
  {
    icon: CalendarDays,
    title: 'Planificador de menús',
    body: 'Arma la semana arrastrando platos al calendario y copia semanas completas en un clic.',
  },
  {
    icon: Warehouse,
    title: 'Abastecimiento',
    body: 'Stock, compras y proveedores, con sugerencias de reposición según tu consumo real.',
  },
  {
    icon: Wallet,
    title: 'Clientes y cobros',
    body: 'Saldos, pagos e historial de cada cliente en un lugar, sin hojas de cálculo.',
  },
]

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` }
}

/**
 * Landing pública de Dark Kitchen. Toma el lenguaje visual de la referencia
 * (fondo oscuro con partículas, titular enorme centrado, un solo CTA muy
 * visible y el producto en laptop + celular) con la identidad propia de la
 * marca: brasas naranjas en vez de estrellas, el acento "brasa" y capturas
 * del tablero de Cocina.
 */
export function LandingPage() {
  const { session } = useAuth()
  const entryHref = session ? '/' : '/login'

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-20 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Dark Kitchen — inicio">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brasa-500 shadow-[0_8px_24px_-8px_var(--color-brasa-500)]">
              <Flame size={16} className="text-white" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight">Dark Kitchen</span>
          </Link>
          <Link
            to={entryHref}
            className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm font-medium text-neutral-200 backdrop-blur transition-colors hover:border-neutral-700 hover:text-neutral-50"
          >
            {session ? 'Ir a mi cuenta' : 'Iniciar sesión'}
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden pt-32 sm:pt-44">
          <EmberField />
          {/* Resplandor de brasa detrás de los dispositivos. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-[radial-gradient(ellipse_55%_60%_at_50%_100%,rgba(249,115,22,0.16),transparent_70%)]"
            aria-hidden
          />
          {/* Líneas verticales tenues de la parte baja, como en la referencia. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[repeating-linear-gradient(90deg,transparent_0,transparent_28px,rgba(255,255,255,0.03)_28px,rgba(255,255,255,0.03)_29px)] [mask-image:linear-gradient(to_top,black,transparent)]"
            aria-hidden
          />

          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h1 className="animate-landing-rise text-[2.6rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Tu cocina bajo control,
              {/* El corte en dos líneas es para escritorio; en móvil lo reparte text-balance. */}
              <br className="hidden sm:block" /> del pedido a la entrega
            </h1>
            <p className="animate-landing-rise mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty text-neutral-400 sm:mt-8 sm:text-xl" style={delay(120)}>
              Pedidos, cocina, despacho, menús, inventario y cobros en una sola plataforma pensada para dark kitchens.
            </p>
            <div className="animate-landing-rise mt-9 sm:mt-11" style={delay(240)}>
              <Link
                to={session || !PUBLIC_SIGNUP_ENABLED ? entryHref : '/registro'}
                className="group inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-brasa-500 px-10 text-base font-semibold text-white shadow-[0_12px_40px_-12px_var(--color-brasa-500)] transition-colors hover:bg-brasa-400 sm:w-96 sm:text-lg"
              >
                {session ? 'Ir a mi cuenta' : PUBLIC_SIGNUP_ENABLED ? 'Crear mi negocio' : 'Entrar a mi cuenta'}
                <ChevronRight size={20} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {!session && PUBLIC_SIGNUP_ENABLED && (
                <p className="mt-4 text-sm text-neutral-500">
                  ¿Ya tienes usuario?{' '}
                  <Link to="/login" className="text-neutral-300 hover:text-neutral-100">
                    Inicia sesión
                  </Link>
                </p>
              )}
            </div>
          </div>

          {/* Recorte inferior a propósito: los dispositivos "asoman" desde el
              borde de la sección, como en la referencia. */}
          <div className="animate-landing-rise relative mx-auto mt-16 h-[clamp(210px,38vw,420px)] max-w-5xl overflow-hidden px-4 sm:mt-20 sm:px-6" style={delay(380)}>
            <DeviceMockups />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-neutral-950 to-transparent" aria-hidden />
          </div>
        </section>

        <section className="border-t border-neutral-800/60 bg-neutral-950" aria-labelledby="landing-features">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <h2 id="landing-features" className="max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Todo lo que pasa en tu cocina, en una sola pantalla
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 transition-colors hover:border-neutral-700">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-brasa-500/20 bg-brasa-500/10 text-brasa-400">
                    <Icon size={19} aria-hidden />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-neutral-100">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-800/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-neutral-500 sm:px-6">
          <span className="flex items-center gap-2">
            <Flame size={14} className="text-brasa-500" aria-hidden /> © {new Date().getFullYear()} Dark Kitchen
          </span>
          <Link to={entryHref} className="transition-colors hover:text-neutral-200">
            {session ? 'Ir a mi cuenta' : 'Iniciar sesión'}
          </Link>
        </div>
      </footer>
    </div>
  )
}
