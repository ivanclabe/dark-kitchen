import clsx from 'clsx'
import { Bike, CheckCircle2, ChefHat, Clock, FilePen, Flame, LayoutDashboard, Soup, Users, Warehouse } from 'lucide-react'

/**
 * Laptop + celular mostrando la app — como las capturas de producto de la
 * referencia. Es una ilustración construida con el mismo lenguaje visual del
 * tablero de Cocina real (columnas en caja, borde de color por SLA,
 * observaciones en ámbar), con datos de ejemplo. Decorativo para lectores de
 * pantalla: se describe con un solo aria-label.
 */

interface MiniCard {
  title: string
  meta: string
  accent: string
  note?: string
  extra?: string
}

const COLUMNS: { label: string; icon: typeof Clock; tone: string; cards: MiniCard[] }[] = [
  {
    label: 'Por confirmar',
    icon: FilePen,
    tone: 'text-neutral-400',
    cards: [{ title: '1× Bowl de pollo', meta: '#2048 · $32.000', accent: 'border-l-neutral-600' }],
  },
  {
    label: 'En cola',
    icon: Clock,
    tone: 'text-blue-400',
    cards: [
      { title: '2× Hamburguesa clásica', meta: '#2046 · 04 min', accent: 'border-l-neutral-600', note: 'Sin cebolla' },
      { title: '1× Wrap vegetariano', meta: '#2047 · 02 min', accent: 'border-l-neutral-600' },
    ],
  },
  {
    label: 'Preparando',
    icon: Flame,
    tone: 'text-amber-400',
    cards: [
      { title: '3× Tacos al pastor', meta: '#2043 · 17 min', accent: 'border-l-amber-500', note: 'Extra picante' },
      { title: '1× Pasta alfredo', meta: '#2044 · 09 min', accent: 'border-l-neutral-600' },
    ],
  },
  {
    label: 'Listo',
    icon: CheckCircle2,
    tone: 'text-emerald-400',
    cards: [{ title: '2× Pizza margarita', meta: '#2041 · 06 min', accent: 'border-l-neutral-600', extra: 'Cra. 15 #93-47' }],
  },
  {
    label: 'En ruta',
    icon: Bike,
    tone: 'text-violet-400',
    cards: [{ title: '1× Ensalada césar', meta: '#2039 · 12 min', accent: 'border-l-neutral-600', extra: 'Andrés · moto' }],
  },
]

function MiniTicket({ card }: { card: MiniCard }) {
  return (
    <div className={clsx('rounded-md border border-l-2 border-neutral-800 bg-neutral-900 px-1.5 py-1', card.accent)}>
      <p className="truncate text-[7px] font-medium text-neutral-100 sm:text-[8px]">{card.title}</p>
      {card.note && <p className="truncate text-[6px] text-amber-300 sm:text-[7px]">⚠ {card.note}</p>}
      {card.extra && <p className="truncate text-[6px] text-neutral-400 sm:text-[7px]">{card.extra}</p>}
      <p className="mt-0.5 text-[6px] tabular-nums text-neutral-500 sm:text-[7px]">{card.meta}</p>
    </div>
  )
}

function Laptop() {
  return (
    // En sm+ el laptop ocupa el 80% izquierdo y deja la franja derecha al
    // celular (en la referencia van lado a lado, sin taparse). En móvil, sin
    // celular, el laptop usa todo el ancho.
    <div className="relative w-full sm:w-[80%]">
      <div className="rounded-t-[1.1rem] border border-b-0 border-neutral-700/70 bg-neutral-900 p-1.5 pb-0 sm:p-2 sm:pb-0">
        <div className="flex aspect-[16/10] overflow-hidden rounded-t-lg border border-b-0 border-neutral-800 bg-neutral-950">
          {/* Rail */}
          <div className="flex w-7 shrink-0 flex-col items-center gap-2 border-r border-neutral-800/60 py-2 sm:w-10 sm:gap-3 sm:py-3">
            <span className="flex size-4 items-center justify-center rounded-md bg-brasa-500 sm:size-5">
              <Flame className="size-2.5 text-white sm:size-3" strokeWidth={2.5} />
            </span>
            {[LayoutDashboard, ChefHat, Soup, Warehouse, Users].map((Icon, i) => (
              <Icon key={i} className={clsx('size-2.5 sm:size-3.5', i === 1 ? 'text-brasa-400' : 'text-neutral-600')} />
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-1.5 sm:gap-2.5 sm:p-3">
            {/* Barra superior */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-neutral-100 sm:text-xs">Cocina</p>
                <p className="flex items-center gap-1 text-[6px] text-neutral-500 sm:text-[8px]">
                  <span className="size-1 rounded-full bg-emerald-400" /> En vivo · 18:42:07
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden text-right sm:block">
                  <p className="text-[7px] text-neutral-500">Ventas de hoy</p>
                  <p className="text-[10px] font-semibold tabular-nums text-neutral-100">$1.284.500</p>
                </div>
                <span className="rounded-md bg-brasa-500 px-1.5 py-0.5 text-[6px] font-semibold text-white sm:px-2 sm:py-1 sm:text-[8px]">+ Nuevo pedido</span>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
              {[
                ['1', 'Por confirmar'],
                ['2', 'En cola'],
                ['2', 'Preparando'],
                ['1', 'Listos'],
                ['38', 'Entregados'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-md border border-neutral-800/60 bg-neutral-900/60 px-1 py-0.5 sm:px-1.5 sm:py-1">
                  <p className="text-[8px] font-semibold tabular-nums text-neutral-100 sm:text-[11px]">{value}</p>
                  <p className="truncate text-[5px] text-neutral-500 sm:text-[7px]">{label}</p>
                </div>
              ))}
            </div>

            {/* Tablero */}
            <div className="grid min-h-0 flex-1 grid-cols-5 gap-1 sm:gap-1.5">
              {COLUMNS.map((col) => (
                <div key={col.label} className="flex min-w-0 flex-col rounded-md border border-neutral-800/60">
                  <p className="flex items-center gap-0.5 truncate px-1 py-0.5 text-[5px] font-semibold tracking-wide text-neutral-300 uppercase sm:px-1.5 sm:py-1 sm:text-[7px]">
                    <col.icon className={clsx('size-2 shrink-0 sm:size-2.5', col.tone)} />
                    {col.label}
                  </p>
                  <div className="flex flex-1 flex-col gap-1 rounded-b-md bg-neutral-900/40 p-0.5 sm:p-1">
                    {col.cards.map((card) => (
                      <MiniTicket key={card.meta} card={card} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Phone() {
  return (
    <div className="absolute top-[22%] right-0 hidden w-[17%] min-w-[130px] sm:block">
      <div className="rounded-[1.8rem] border border-neutral-700/70 bg-neutral-900 p-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]">
        <div className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-b from-neutral-950 via-neutral-950 to-[#2a1407] px-3 pt-2 pb-10">
          <div className="flex items-center justify-between text-[7px] text-neutral-400">
            <span>9:41</span>
            <span className="h-2.5 w-12 rounded-full bg-neutral-900" />
            <span>●●●</span>
          </div>

          <p className="mt-3 flex items-center gap-1 text-[7px] text-emerald-400">
            <span className="size-1 rounded-full bg-emerald-400" /> En vivo
          </p>

          <div className="mt-3 text-center">
            <Flame className="mx-auto size-3 text-brasa-400" />
            <p className="mt-1 text-[7px] text-neutral-500">Ventas de hoy</p>
            <p className="text-lg leading-tight font-semibold tabular-nums text-neutral-50">$1.284.500</p>
            <p className="text-[7px] text-neutral-500">38 pedidos</p>
          </div>

          {/* Mini gráfico de área, mismo estilo que el Dashboard real */}
          <svg viewBox="0 0 120 40" className="mt-2 w-full" aria-hidden>
            <defs>
              <linearGradient id="landing-phone-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 32 L12 30 L24 31 L36 24 L48 26 L60 18 L72 21 L84 12 L96 15 L108 7 L120 9 L120 40 L0 40 Z" fill="url(#landing-phone-fill)" />
            <path d="M0 32 L12 30 L24 31 L36 24 L48 26 L60 18 L72 21 L84 12 L96 15 L108 7 L120 9" fill="none" stroke="#fb923c" strokeWidth="1.2" />
          </svg>

          <div className="mt-2 space-y-1">
            {[
              ['#2041', 'Listo', 'text-emerald-400'],
              ['#2039', 'En ruta', 'text-violet-400'],
            ].map(([num, status, tone]) => (
              <div key={num} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/80 px-2 py-1 text-[7px]">
                <span className="tabular-nums text-neutral-300">{num}</span>
                <span className={tone}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DeviceMockups() {
  return (
    <div role="img" aria-label="Vista previa de Dark Kitchen: el tablero de Cocina en un computador y el resumen de ventas en el celular" className="relative">
      <Laptop />
      <Phone />
    </div>
  )
}
