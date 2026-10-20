import { formatMoney } from '@/shared/utils/format'
import { Mic } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

/** A small, exact piece of the app (its dark theme, its words), cropped into the panel. */
function Proof({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[var(--l-radius)] bg-[var(--l-stage)] p-6 sm:w-[400px] sm:shrink-0">
      <div data-ui className="text-sm text-neutral-100">
        {children}
      </div>
    </div>
  )
}

const RECIPE = [
  { name: 'Pan brioche', cost: 1200 },
  { name: 'Carne de res, 150 g', cost: 4300 },
  { name: 'Queso', cost: 900 },
  { name: 'Tocineta', cost: 1000 },
]

/** Everything here exists in the app today (PRODUCT.md): no «próximamente», no invented figures. */
const FEATURES: { title: string; body: string[]; proof: ReactNode }[] = [
  {
    title: 'Inventario y compras',
    body: [
      'Stock, compras y proveedores en un lugar. Te avisa qué insumo quedó por debajo de su mínimo y te sugiere cuánto reponer según lo que de verdad gastas.',
      'Sube la foto o el PDF de una factura: quanela la lee y la deja lista para que la revises y la confirmes.',
    ],
    proof: (
      <ul className="space-y-2 tabular-nums">
        <li className="flex justify-between gap-3">
          <span>Pan brioche</span>
          <span className="text-amber-400">11 und · mínimo 20</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Carne de res</span>
          <span className="text-neutral-300">2,25 kg</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Mora</span>
          <span className="text-neutral-300">1,60 kg</span>
        </li>
      </ul>
    ),
  },
  {
    title: 'Recetas y costo por plato',
    body: [
      'Cada plato con su receta: lo que lleva, cuánto cuesta y cuánto te deja. El costo sale de lo que pagas por cada insumo.',
      'Así sabes qué plato vende mucho y deja poco, antes de que se note en la caja.',
    ],
    proof: (
      <div className="tabular-nums">
        <p className="font-medium">Hamburguesa de la casa</p>
        <ul className="mt-2 space-y-1 text-neutral-400">
          {RECIPE.map((r) => (
            <li key={r.name} className="flex justify-between gap-3">
              <span>{r.name}</span>
              <span>{formatMoney(r.cost)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 flex justify-between gap-3 font-medium">
          <span>Costo {formatMoney(7400)}</span>
          <span className="text-emerald-400">Margen 66 %</span>
        </p>
      </div>
    ),
  },
  {
    title: 'Menú web y WhatsApp',
    body: [
      'El menú de hoy en una página para tus clientes, con su enlace y su código QR. Los pedidos que hacen ahí entran directo a la cocina.',
      'Desde el plan Business conectas el WhatsApp oficial de tu negocio: tus clientes reciben el estado de su pedido y también pueden pedir por ahí.',
    ],
    proof: (
      <div className="space-y-2.5">
        <p className="flex items-center justify-between gap-3">
          <span className="text-neutral-300">quanela.com/menu/brasa-pan</span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">Publicado</span>
        </p>
        <p className="rounded-lg bg-neutral-900 px-3 py-2 text-neutral-100">Tu pedido #1004 va en camino con Andrés.</p>
      </div>
    ),
  },
  {
    title: 'Finanzas',
    body: [
      'Gastos, lo que le debes a tus proveedores y la nómina, liquidada con las horas reales de los turnos.',
      'La utilidad real del mes, de las ventas a la utilidad operativa, y el flujo de caja: lo que entró y lo que salió.',
    ],
    proof: (
      <ul className="space-y-2 tabular-nums">
        <li className="flex justify-between gap-3">
          <span>Arriendo</span>
          <span className="text-amber-400">Vence el 5 nov</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Carnes del Norte</span>
          <span className="text-neutral-300">Por pagar {formatMoney(640000)}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Nómina 1–15 oct</span>
          <span className="text-neutral-300">312 h</span>
        </li>
      </ul>
    ),
  },
  {
    title: 'Oye quanela',
    body: [
      'Comandos de voz y avisos hablados para la cocina, en español. La línea avanza los pedidos sin soltar la espátula.',
      'Y quanela Copilot responde preguntas sobre tu operación con tus datos.',
    ],
    proof: (
      <div className="space-y-2.5">
        <p className="flex items-center gap-2 text-neutral-300">
          <Mic size={14} className="text-brasa-400" aria-hidden /> «Oye quanela, pedido 1004 listo»
        </p>
        <p className="rounded-lg bg-neutral-900 px-3 py-2 text-neutral-100">Pedido 1004 listo para despachar.</p>
      </div>
    ),
  },
  {
    title: 'Clientes y cartera',
    body: [
      'Saldos, pagos e historial de cada cliente. Quién te debe, cuánto y desde cuándo, sin hojas de cálculo.',
      'Cada pedido lleva su pago aparte, en efectivo, transferencia o tarjeta; lo que no se paga queda en el saldo del cliente.',
    ],
    proof: (
      <ul className="space-y-2 tabular-nums">
        <li className="flex justify-between gap-3">
          <span>Valentina Ríos</span>
          <span className="text-amber-400">Debe {formatMoney(24000)}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Andrés Pérez</span>
          <span className="text-neutral-300">Al día</span>
        </li>
      </ul>
    ),
  },
  {
    title: 'Tu equipo, cada quien en lo suyo',
    body: [
      'La caja cobra, la cocina cocina, el domiciliario ve sus entregas. Cada persona entra solo a las cuentas que le asignas y con el rol que le das.',
      'Si tienes varios locales, cada uno es una cuenta con sus datos separados.',
    ],
    proof: (
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {['Administrador', 'Gerente', 'Caja', 'Cocina', 'Domiciliario'].map((role) => (
          <li key={role} className="rounded-full bg-neutral-800 px-2.5 py-1 text-neutral-200">
            {role}
          </li>
        ))}
      </ul>
    ),
  },
]

/** The rest of the day, each with a small proof beside it: one module down the page, never alternating. */
export function FeatureProofs() {
  return (
    <section id="funcionalidades" className="scroll-mt-24 px-[var(--l-margin)] pb-[clamp(96px,12vw,180px)] lg:pl-[22vw]" aria-labelledby="landing-features">
      <h2 id="landing-features" data-reveal className="landing-display max-w-[20ch] text-[length:var(--l-size-title)]">
        Y el resto del día, en el mismo lugar
      </h2>
      <div className="mt-16 space-y-14 lg:space-y-20">
        {FEATURES.map((f) => (
          <article key={f.title} className="flex max-w-[800px] flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
            <div data-reveal>
              <Proof>{f.proof}</Proof>
            </div>
            <div data-reveal style={{ '--i': 1 } as CSSProperties} className="sm:max-w-[340px]">
              <h3 className="text-[length:var(--l-size-text)] font-semibold">{f.title}</h3>
              {f.body.map((p) => (
                <p key={p} className="mt-2 text-[length:var(--l-size-small)] leading-relaxed text-[var(--l-soft)]">
                  {p}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
