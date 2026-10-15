import { BrandLogo } from '@/shared/brand/BrandMark'
import clsx from 'clsx'
import { Bell, ChefHat, Home, MoreVertical, Receipt, Search, ShoppingBag, Utensils, Warehouse } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Draws `children` at a fixed design size (width × height) and scales it to the width it gets, so the screens
 * read the same on a phone and on a large monitor.
 */
function Fit({ width, height, className, children }: { width: number; height: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])
  return (
    <div ref={ref} className={clsx('relative overflow-hidden', className)} style={{ height: height * scale }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}

type Order = { number: number; dish: string; extra: string; minutes: string }

/** Today's orders on the board (fictional). */
const BOARD: { title: string; count: number; tone: string; bar: string; orders: Order[] }[] = [
  {
    title: 'Confirmado',
    count: 3,
    tone: 'bg-orange-50 text-orange-700',
    bar: 'border-l-orange-400',
    orders: [
      { number: 1005, dish: 'Arroz con pollo', extra: '+ Bebida', minutes: '5 min' },
      { number: 1006, dish: 'Hamburguesa', extra: '+ Papas', minutes: '8 min' },
      { number: 1007, dish: 'Bandeja paisa', extra: '+ Sopa', minutes: '12 min' },
    ],
  },
  {
    title: 'En preparación',
    count: 4,
    tone: 'bg-sky-50 text-sky-700',
    bar: 'border-l-sky-400',
    orders: [
      { number: 1008, dish: 'Pollo a la plancha', extra: '+ Ensalada', minutes: '18 min' },
      { number: 1009, dish: 'Salchipapa', extra: '+ Gaseosa', minutes: '20 min' },
      { number: 1010, dish: 'Carne asada', extra: '+ Yuca', minutes: '25 min' },
    ],
  },
  {
    title: 'Listo',
    count: 4,
    tone: 'bg-emerald-50 text-emerald-700',
    bar: 'border-l-emerald-400',
    orders: [
      { number: 1003, dish: 'Arroz con camarones', extra: 'Para recoger', minutes: '3 min' },
      { number: 1004, dish: 'Pasta al pesto', extra: 'Domicilio', minutes: '6 min' },
      { number: 1011, dish: 'Hamburguesa', extra: '+ Yuca', minutes: '7 min' },
    ],
  },
]

const NAV = [
  { icon: Home, label: 'Inicio', active: true },
  { icon: Receipt, label: 'Pedidos' },
  { icon: ChefHat, label: 'Cocina' },
  { icon: Utensils, label: 'Menús' },
  { icon: Warehouse, label: 'Inventario' },
]

/** The orders board of the app, light theme, at 960 × 600. */
function LaptopScreen() {
  return (
    <div className="flex h-full bg-white text-[#1C1310]">
      <aside className="w-44 shrink-0 border-r border-black/[0.06] bg-[#FFFBF7] px-3 py-4">
        <BrandLogo className="h-8" />
        <nav className="mt-6 space-y-1">
          {NAV.map(({ icon: Icon, label, active }) => (
            <span key={label} className={clsx('flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]', active ? 'bg-orange-100 font-semibold text-orange-700' : 'text-neutral-500')}>
              <Icon size={15} /> {label}
            </span>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 px-6 py-5">
        <div className="flex items-center gap-3">
          <p className="text-[19px] font-bold">Pedidos de hoy</p>
          <span className="ml-auto flex w-48 items-center gap-2 rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] text-neutral-400">
            <Search size={13} /> Buscar pedido…
          </span>
          <span className="relative text-neutral-500">
            <Bell size={17} />
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-orange-500" />
          </span>
          <span className="flex items-center gap-2 text-[12px] font-medium text-neutral-600">
            <span className="flex size-7 items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold text-white">CC</span>
            Cocina Centro
          </span>
        </div>
        <div className="mt-4 flex gap-2 text-[12px]">
          {[
            ['Todos', '12', 'bg-orange-500 text-white'],
            ['En preparación', '5', 'bg-white text-neutral-600 ring-1 ring-black/10'],
            ['Listos', '4', 'bg-white text-neutral-600 ring-1 ring-black/10'],
            ['Cancelados', '1', 'bg-white text-neutral-600 ring-1 ring-black/10'],
          ].map(([label, n, style]) => (
            <span key={label} className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium', style)}>
              {label} <span className="opacity-80">{n}</span>
            </span>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {BOARD.map((col) => (
            <div key={col.title} className="rounded-xl bg-neutral-50 p-2.5">
              <p className={clsx('flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] font-semibold', col.tone)}>
                {col.title} <span>{col.count}</span>
              </p>
              <div className="mt-2.5 space-y-2">
                {col.orders.map((o) => (
                  <div key={o.number} className={clsx('rounded-lg border-l-[3px] bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]', col.bar)}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-orange-600">#{o.number}</span>
                      <span className="text-neutral-400">{o.minutes}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-[13px] font-semibold">{o.dish}</p>
                      <MoreVertical size={13} className="text-neutral-300" />
                    </div>
                    <p className="text-[11px] text-neutral-400">{o.extra}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** An illustrated plate of arroz con pollo (no photos of real dishes). */
function Plate() {
  return (
    <svg viewBox="0 0 240 120" className="h-full w-full">
      <rect width="240" height="120" fill="#FCE7D3" />
      <ellipse cx="120" cy="64" rx="92" ry="48" fill="#fff" />
      <ellipse cx="120" cy="64" rx="74" ry="37" fill="#F6F1EA" />
      <ellipse cx="100" cy="60" rx="38" ry="22" fill="#FBE7A1" />
      <g fill="#F2C94C">
        <circle cx="88" cy="56" r="3" />
        <circle cx="104" cy="66" r="2.5" />
        <circle cx="112" cy="54" r="2.5" />
      </g>
      <g fill="#7BB661">
        <circle cx="94" cy="64" r="2.5" />
        <circle cx="116" cy="62" r="2" />
      </g>
      <g fill="#C8742F">
        <rect x="128" y="44" width="34" height="18" rx="8" transform="rotate(-12 145 53)" />
        <rect x="136" y="62" width="32" height="16" rx="7" transform="rotate(8 152 70)" />
      </g>
      <g fill="#F2B33D">
        <ellipse cx="160" cy="84" rx="14" ry="7" />
        <ellipse cx="78" cy="84" rx="13" ry="6.5" />
      </g>
      <circle cx="176" cy="54" r="6" fill="#E85D3A" />
    </svg>
  )
}

/** The public menu on a phone, at 300 × 560: a configurable dish (ADR 0059). */
function PhoneScreen() {
  return (
    <div className="flex h-full flex-col bg-white px-4 pt-3 text-[#1C1310]">
      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span>9:41</span>
        <span className="h-5 w-20 rounded-full bg-black" />
        <span>•••</span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-[18px] font-bold">Menú del día</p>
        <ShoppingBag size={18} className="text-neutral-500" />
      </div>
      <div className="mt-3 flex gap-1.5 text-[11px]">
        <span className="rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-700">Todos</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-500">Principales</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-500">Bebidas</span>
      </div>
      <div className="mt-3 h-[120px] overflow-hidden rounded-xl">
        <Plate />
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <p className="text-[15px] font-bold">Arroz con pollo</p>
        <p className="text-[14px] font-bold text-orange-600">$18.000</p>
      </div>
      <p className="mt-0.5 text-[11px] text-neutral-400">Arroz con pollo de la casa, con su sopa.</p>
      <p className="mt-3 text-[12px] font-semibold">Acompañantes</p>
      <div className="mt-1.5 space-y-2 text-[12px]">
        {[
          ['Patacones', '+ $2.000', false],
          ['Ensalada', '+ $1.500', false],
          ['Sopa del día', 'Gratis', true],
        ].map(([name, price, checked]) => (
          <div key={name as string} className="flex items-center gap-2">
            <span className={clsx('flex size-4 items-center justify-center rounded border', checked ? 'border-orange-500 bg-orange-500 text-[10px] text-white' : 'border-neutral-300')}>
              {checked ? '✓' : ''}
            </span>
            <span className="flex-1">{name}</span>
            <span className={checked ? 'font-semibold text-orange-600' : 'text-neutral-500'}>{price}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto mb-6 rounded-xl bg-orange-500 py-3 text-center text-[13px] font-semibold text-white">Agregar al carrito</div>
    </div>
  )
}

/** A laptop with the orders board. Decorative. */
export function LaptopMockup({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="rounded-t-[1.4rem] bg-[#1F1B19] p-[1.6%] shadow-[0_40px_80px_-30px_rgba(124,45,18,0.55)]">
        <Fit width={960} height={600} className="rounded-md">
          <LaptopScreen />
        </Fit>
      </div>
      <div className="mx-[-4%] h-3 rounded-b-xl bg-[linear-gradient(#D6D3D1,#A8A29E)] sm:h-4" />
    </div>
  )
}

/** A phone with the public menu. Decorative. */
export function PhoneMockup({ className }: { className?: string }) {
  return (
    <div className={clsx('rounded-[2.2rem] bg-[#1F1B19] p-[3.5%] shadow-[0_30px_60px_-20px_rgba(124,45,18,0.6)]', className)} aria-hidden>
      <Fit width={300} height={560} className="rounded-[1.8rem]">
        <PhoneScreen />
      </Fit>
    </div>
  )
}
