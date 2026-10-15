import { useAuth } from '@/shared/hooks/useAuth'
import { BrandLogo, BrandMark } from '@/shared/brand/BrandMark'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { helpHref } from '@/shared/help/helpUrl'
import { ArrowRight, BarChart3, CalendarDays, ChefHat, MessageCircleMore, Package, PlayCircle, Sparkles, Wallet, Warehouse, type LucideIcon } from 'lucide-react'
import { useEffect, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LaptopMockup, PhoneMockup } from '../components/HeroDevices'
import { FaqSection } from '../components/FaqSection'
import { LandingNav } from '../components/LandingNav'
import { PricingSection } from '../components/PricingSection'
import { DISPLAY_FONT, display } from '../lib/typography'

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


/** What Quanela does, in five words each (all of it exists in the app). */
const HIGHLIGHTS: { icon: LucideIcon; label: string }[] = [
  { icon: MessageCircleMore, label: 'Pedidos por WhatsApp' },
  { icon: ChefHat, label: 'Gestión de cocina' },
  { icon: Package, label: 'Control de inventario' },
  { icon: BarChart3, label: 'Reportes en tiempo real' },
  { icon: Sparkles, label: 'Agentes de IA para automatizar' },
]

/** The brand's hero scene (mascot, food, channels). */
const HERO_IMAGE = '/brand/landing-hero.webp'

/**
 * Landing pública de Quanela, según el boceto de la marca: el logo grande, «Tu cocina, más inteligente», dos
 * acciones y cinco cosas que hace la app; a la derecha, la escena de la mascota con el tablero de pedidos en
 * un portátil y el menú web en un celular. Todo lo que dice existe hoy en la app: ni cifras inventadas ni
 * testimonios.
 */
export function LandingPage() {
  const { session } = useAuth()
  const { hash } = useLocation()

  // Enlaces a una sección (/#precios, también desde /precios): desplazamiento suave.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('scroll-smooth')
    return () => root.classList.remove('scroll-smooth')
  }, [])
  // The landing has its own palette: a visitor's light theme of the app (ADR 0023) must not invert it.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.theme
    root.dataset.theme = 'dark'
    return () => {
      if (previous) root.dataset.theme = previous
    }
  }, [])
  useEffect(() => {
    if (document.querySelector('link[data-landing-font]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = DISPLAY_FONT
    link.dataset.landingFont = 'true'
    document.head.appendChild(link)
  }, [])
  useEffect(() => {
    if (!hash) return
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 50)
    return () => window.clearTimeout(id)
  }, [hash])

  return (
    <div className="min-h-screen bg-[#FBF6EF] text-[#1C1310]">
      <LandingNav />

      <main>
        <section id="producto" className="relative isolate scroll-mt-16 overflow-hidden bg-[#FDF7F1]">
          {/* The brand's scene (wide screens): the mascot, the food and the channels Quanela works with. */}
          <img
            src={HERO_IMAGE}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 hidden size-full object-cover object-[70%_100%] lg:block"
          />

          <div className="relative mx-auto max-w-7xl px-4 pt-24 pb-10 sm:px-6 sm:pt-28 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-24 lg:pb-14">
            <div className="relative z-10 max-w-xl lg:max-w-[37rem]">
              <BrandLogo className="animate-landing-rise hidden h-24 lg:block xl:h-28" />
              <h1
                style={{ ...display, ...delay(60) }}
                className="animate-landing-rise text-[3.1rem] leading-[1.02] font-black tracking-[-0.02em] text-[#1C1310] sm:text-6xl lg:mt-8 lg:text-[3.6rem] xl:text-[4.1rem] 2xl:text-[4.6rem]"
              >
                Tu cocina,
                <br /> <span className="text-brasa-500">más inteligente</span>
              </h1>
              <p className="animate-landing-rise mt-6 max-w-lg text-lg leading-snug text-pretty text-[#5B4A42] sm:text-[1.4rem]" style={delay(120)}>
                La plataforma con agentes de IA para gestionar pedidos, inventario, menús y mucho más en tu dark kitchen o restaurante.
              </p>
              <div className="animate-landing-rise mt-8 flex flex-wrap items-center gap-3" style={delay(200)}>
                <Link
                  to={session ? APP_ENTRY : '/registro'}
                  className="group inline-flex items-center gap-2.5 rounded-2xl bg-brasa-500 px-7 py-4 text-lg font-semibold text-white shadow-[0_16px_30px_-14px_var(--color-brasa-600)] transition-colors hover:bg-brasa-600"
                >
                  {session ? 'Ir a mi cuenta' : 'Comienza gratis'}
                  <ArrowRight size={20} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
                <a
                  href="#funcionalidades"
                  className="inline-flex items-center gap-3 rounded-2xl bg-white/70 px-6 py-4 text-lg font-medium text-[#5B4A42] ring-1 ring-brasa-500/25 backdrop-blur-sm transition-colors hover:bg-white"
                >
                  <PlayCircle size={24} className="text-brasa-500" aria-hidden /> Ver cómo funciona
                </a>
              </div>
              <ul className="animate-landing-rise mt-10 grid max-w-[34rem] grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-5" style={delay(300)}>
                {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex flex-col items-center gap-2 text-center text-[13px] leading-tight font-medium text-[#3B2C26] sm:text-sm">
                    <span className="flex size-14 items-center justify-center rounded-2xl bg-white text-brasa-500 shadow-[0_10px_24px_-14px_rgba(124,45,18,0.45)] ring-1 ring-black/[0.04]">
                      <Icon size={26} strokeWidth={1.9} aria-hidden />
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* The product (wide screens): the orders board on a laptop and the web menu on a phone. */}
          <div className="animate-landing-rise pointer-events-none absolute right-[1.5%] bottom-[2%] hidden w-[min(47vw,78svh)] lg:block" style={delay(380)}>
            <LaptopMockup className="origin-right [transform:perspective(2400px)_rotateY(-9deg)_rotateX(2deg)]" />
            <PhoneMockup className="absolute bottom-[1%] left-[1%] w-[22%]" />
          </div>

          {/* Phones and tablets: the scene, then the product. */}
          <div className="relative px-4 pb-14 sm:px-6 lg:hidden">
            <img src={HERO_IMAGE} alt="" aria-hidden className="aspect-[16/11] w-full rounded-3xl object-cover object-[88%_25%]" />
            <div className="relative -mt-16 sm:-mt-28">
              <LaptopMockup className="ml-auto w-[86%]" />
              <PhoneMockup className="absolute -bottom-6 left-0 w-[32%]" />
            </div>
          </div>
        </section>

        <section id="funcionalidades" className="scroll-mt-24 bg-white" aria-labelledby="landing-features">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
            <h2 id="landing-features" style={display} className="max-w-2xl text-3xl font-black tracking-[-0.02em] text-balance text-[#1C1310] sm:text-5xl">
              Todo lo que pasa en tu cocina, <span className="text-brasa-500">en una sola pantalla.</span>
            </h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl bg-[#FAF7F3] p-6 ring-1 ring-black/[0.06] transition-shadow hover:shadow-[0_18px_40px_-24px_rgba(30,20,10,0.45)]">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brasa-500 text-white shadow-[0_10px_24px_-12px_var(--color-brasa-500)]">
                    <Icon size={20} aria-hidden />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-neutral-950">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <PricingSection />
        <FaqSection />
      </main>

      <footer className="theme-light border-t border-[#1C1310]/[0.07] bg-[#FBF6EF]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-neutral-500 sm:px-6">
          <span className="flex items-center gap-2">
            <BrandMark className="size-6" /> © {new Date().getFullYear()} Quanela
          </span>
          <nav aria-label="Pie de página" className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="#precios" className="transition-colors hover:text-neutral-200">
              Precios
            </a>
            <a href="#faq" className="transition-colors hover:text-neutral-200">
              FAQ
            </a>
            <a href={helpHref()} className="transition-colors hover:text-neutral-200">
              Centro de ayuda
            </a>
            <Link to={session ? APP_ENTRY : '/login'} className="transition-colors hover:text-neutral-200">
              {session ? 'Ir a mi cuenta' : 'Iniciar sesión'}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
