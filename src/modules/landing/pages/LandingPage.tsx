import { useAuth } from '@/shared/hooks/useAuth'
import { RobotFace } from '@/shared/robot/RobotFace'
import { applyAppearance, applyRouteDefault, savedTheme } from '@/shared/appearance/appearance'
import { APP_ENTRY } from '@/shared/tenant/navigation'
import { helpHref } from '@/shared/help/helpUrl'
import { LEGAL_COMPANY, QUANELA_DOCUMENTS, legalHref } from '@/shared/legal/documents'
import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ClosingSection } from '../components/ClosingSection'
import { FaqSection } from '../components/FaqSection'
import { FeatureProofs } from '../components/FeatureProofs'
import { GhostHeadline } from '../components/GhostHeadline'
import { LandingNav } from '../components/LandingNav'
import { MenuPlannerSection } from '../components/MenuPlannerSection'
import { OrderStory, type StoryStep } from '../components/OrderStory'
import { PricingSection } from '../components/PricingSection'
import { ProductShowcase } from '../components/ProductShowcase'
import { loadDisplayFont } from '../lib/typography'
import '../landing.css'

/** How one order travels through the day. Everything it says exists in the app today: no invented figures. */
const STEPS: StoryStep[] = [
  {
    title: 'Llega por donde te escriben',
    body: (
      <>
        <p>Un pedido por WhatsApp, por tu menú web, por teléfono o en el mostrador entra a la misma lista, con el cliente, sus platos y su total.</p>
        <p>Lo confirmas y Quanela aparta los insumos que lleva cada receta.</p>
      </>
    ),
  },
  {
    title: 'La cocina lo ve plato por plato',
    body: (
      <>
        <p>En la vista Cocina cada pedido muestra sus platos enteros y el tiempo desde que entró. Si pasa del tiempo que definiste, se pone en rojo.</p>
        <p>Con «Oye Quanela», la línea avanza los pedidos por voz, sin tocar la pantalla.</p>
      </>
    ),
  },
  {
    title: 'Sale con su domiciliario',
    body: (
      <>
        <p>Despacho reúne lo que está listo y lo que va en camino: asignas quién lo lleva, sabes hace cuánto salió y lo marcas entregado cuando llega.</p>
        <p>El cobro va aparte: el pedido queda por cobrar hasta que registras el pago.</p>
      </>
    ),
  },
  {
    title: 'Se descuenta y se costea solo',
    body: (
      <>
        <p>Cuando la cocina empieza cada plato, sus insumos salen del inventario según la receta. Cada venta sabe cuánto costó y cuánto te dejó.</p>
        <p>Sin pasar nada a mano a una hoja de cálculo al final del día.</p>
      </>
    ),
  },
  {
    title: 'Y te dice qué hacer después',
    body: (
      <>
        <p>
          Los agentes de IA trabajan sobre ese pedido y todos los demás: qué comprar, qué perecedero está en riesgo, qué plato se vende por debajo de su costo, qué pedido se
          quedó quieto.
        </p>
        <p>Recomiendan y te dicen por qué. Tú decides.</p>
        <img src="/robot/robot-idea-lg.webp" width={368} height={288} alt="El robot de Quanela con una idea" loading="lazy" className="mt-4 h-36 w-auto lg:hidden" />
      </>
    ),
  },
]

/** Entrances, once per element as it enters; without the observer everything simply stays visible. */
function useReveal() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    el.classList.add('landing-motion')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    )
    // Sections that render later (the plans, once loaded) are picked up too.
    const watch = () => el.querySelectorAll('[data-reveal]:not(.is-in)').forEach((n) => io.observe(n))
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      io.disconnect()
      mo.disconnect()
    }
  }, [])
  return root
}

function rise(i: number): CSSProperties {
  return { '--i': i } as CSSProperties
}

/**
 * Landing pública de Quanela (ADR 0068): «La comanda que viaja». A la izquierda, un pedido de ejemplo que no
 * se va de la pantalla; a la derecha, cómo viaja del WhatsApp a la caja. Luego la app por dentro (pantallas
 * reales con datos de ejemplo), el resto del día, los planes (de la base), las preguntas y el registro ya
 * abierto. Todo lo que dice existe hoy en la app: ni clientes, ni testimonios, ni cifras inventadas.
 */
/** Who sells (Ley 1480 art. 50 a): only what the company has provided in content/legal/empresa.yaml. */
const sellerLine = [
  LEGAL_COMPANY.razonSocial,
  LEGAL_COMPANY.nit && `NIT ${LEGAL_COMPANY.nit}`,
  [LEGAL_COMPANY.direccion, LEGAL_COMPANY.ciudad].filter(Boolean).join(', '),
  LEGAL_COMPANY.telefono,
  LEGAL_COMPANY.correoPqr,
]
  .filter(Boolean)
  .join(' · ')

export function LandingPage() {
  const { session } = useAuth()
  const root = useReveal()
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
    root.dataset.theme = 'dark'
    // The page itself is light: native controls and the scrollbar too (ADR 0061).
    root.style.colorScheme = 'light'
    // The landing's white reaches the edges, also when the page is pulled past its end.
    root.style.backgroundColor = '#ffffff'
    return () => {
      root.style.backgroundColor = ''
      // Leaving the landing (to the login, for instance): the chosen theme, or the next page's default.
      if (savedTheme() !== null) applyAppearance()
      else applyRouteDefault(window.location.pathname)
    }
  }, [])
  // Its own chunk: only the landing downloads Nunito (the module system loads it once).
  useEffect(() => {
    void loadDisplayFont()
  }, [])
  useEffect(() => {
    if (!hash) return
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 50)
    return () => window.clearTimeout(id)
  }, [hash])

  return (
    <div ref={root} className="landing min-h-dvh">
      <LandingNav />

      <main>
        <OrderStory
          steps={STEPS}
          hero={
            <section id="producto" className="landing-hero relative flex scroll-mt-24 flex-col px-[var(--l-margin)] pt-8 pb-16 lg:min-h-[calc(100svh-88px)] lg:justify-center lg:pt-12" aria-labelledby="landing-title">
              {/* The brand's name, huge: an image of the name (the page's heading is the sentence that says what it is). */}
              <p className="landing-display landing-name order-first leading-[0.9] lg:order-none" aria-hidden>
                <span className="landing-name-ink landing-rise">quanela</span>
                <span className="landing-name-over landing-rise">quanela</span>
              </p>
              <div className="mt-6 max-w-[36rem] lg:mt-0 lg:ml-[clamp(0px,4vw,72px)]">
                <GhostHeadline id="landing-title" className="landing-display text-[clamp(34px,3.6vw,56px)] leading-[1.02]" />
                <p className="landing-rise mt-5 max-w-[46ch]" style={rise(2)}>
                  Pedidos por WhatsApp y menú web, cocina, domicilios, inventario, costos y clientes, con agentes de IA que recomiendan sobre tus datos reales.
                </p>
                <div className="landing-rise mt-8 flex flex-wrap items-center gap-x-6 gap-y-3" style={rise(3)}>
                  <Link to={session ? APP_ENTRY : '/registro'} className="landing-button landing-button-accent">
                    {session ? 'Ir a mi cuenta' : 'Crear mi cuenta'} <ArrowRight size={18} aria-hidden />
                  </Link>
                  <span className="text-[length:var(--l-size-small)] text-[var(--l-soft)]">Sin permanencia. Pagas en línea con tarjeta, PSE o Nequi.</span>
                </div>
              </div>
            </section>
          }
        />

        <ProductShowcase />
        <MenuPlannerSection />
        <FeatureProofs />
        <PricingSection />
        <FaqSection />
        <ClosingSection />
      </main>

      <footer className="grid gap-2 px-[var(--l-margin)] pt-20 pb-6 text-[length:var(--l-size-small)] sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6 sm:pb-[30px]">
        <span className="flex items-center gap-2.5 text-[var(--l-soft)]">
          <RobotFace mood="info" size={32} lazy />
          Quanela · operación e IA para cocinas
        </span>
        <nav aria-label="Pie de página" className="flex flex-wrap gap-x-6 gap-y-1">
          <a href="#precios" className="landing-link">
            Precios
          </a>
          <a href="#faq" className="landing-link">
            Preguntas
          </a>
          <a href={helpHref()} className="landing-link">
            Centro de ayuda
          </a>
          <Link to={session ? APP_ENTRY : '/login'} className="landing-link">
            {session ? 'Ir a mi cuenta' : 'Iniciar sesión'}
          </Link>
        </nav>
        <span className="text-[var(--l-soft)] sm:text-right">© {new Date().getFullYear()} Quanela</span>
        {/* ADR 0071: the documents, who sells (Ley 1480 art. 50) and the consumer authority. */}
        <nav aria-label="Documentos legales" className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--l-field)] pt-4 sm:col-span-3">
          {QUANELA_DOCUMENTS.map((doc) => (
            <Link key={doc.slug} to={legalHref(doc.slug)} className="landing-link">
              {doc.title}
            </Link>
          ))}
          <Link to="/legal/preferencias" className="landing-link">
            Preferencias de privacidad
          </Link>
          <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer" className="landing-link">
            Superintendencia de Industria y Comercio
          </a>
        </nav>
        {sellerLine && <p className="text-[var(--l-soft)] sm:col-span-3">{sellerLine}</p>}
      </footer>
    </div>
  )
}
