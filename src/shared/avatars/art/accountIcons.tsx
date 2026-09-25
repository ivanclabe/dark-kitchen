import type { ReactNode } from 'react'
import type { AccountIconKey } from '../catalog'

/**
 * Ilustraciones SVG propias (sin bancos de imágenes), planas, sobre una
 * tarjeta oscura con degradado. Cuadrícula de 64×64, igual que los avatares
 * de personas, para verse coherentes en cualquier tamaño.
 */
export interface AvatarArt {
  /** Degradado del fondo: [arriba-izquierda, abajo-derecha]. */
  bg: [string, string]
  art: ReactNode
}

const steam = (x: number) => (
  <path d={`M${x} 16c-2-2.5 2-4.5 0-7`} fill="none" stroke="#e7e5e4" strokeWidth="2" strokeLinecap="round" opacity=".7" />
)

/** Iconos de establecimiento (Cuentas): la galería original de Dark Kitchen. */
export const ACCOUNT_ICON_ART: Record<AccountIconKey, AvatarArt> = {
  chef: {
    bg: ['#7c2d12', '#c2410c'],
    art: (
      <>
        <circle cx="22" cy="28" r="8" fill="#fff7ed" />
        <circle cx="32" cy="22" r="10" fill="#fff7ed" />
        <circle cx="42" cy="28" r="8" fill="#fff7ed" />
        <rect x="21" y="27" width="22" height="16" rx="3" fill="#fff7ed" />
        <rect x="21" y="38" width="22" height="7" rx="2" fill="#fed7aa" />
        <path d="M27 31v5M32 30v6M37 31v5" stroke="#fdba74" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  burger: {
    bg: ['#431407', '#92400e'],
    art: (
      <>
        <path d="M15 31a17 13 0 0 1 34 0z" fill="#f59e0b" />
        <ellipse cx="26" cy="24" rx="1.4" ry=".8" fill="#fff7ed" />
        <ellipse cx="33" cy="21.5" rx="1.4" ry=".8" fill="#fff7ed" />
        <ellipse cx="39" cy="25" rx="1.4" ry=".8" fill="#fff7ed" />
        <path d="M14 32c3 3 5-1 8 1s5-2 8 0 5-2 8 0 5-2 8 0 4 1 4 1v-3H14z" fill="#84cc16" />
        <rect x="15" y="34" width="34" height="6" rx="3" fill="#7c2d12" />
        <path d="M17 34h30l-5 5-4-3-4 3-4-3-4 3-4-3z" fill="#facc15" />
        <rect x="16" y="41" width="32" height="7" rx="3.5" fill="#f59e0b" />
      </>
    ),
  },
  pizza: {
    bg: ['#450a0a', '#991b1b'],
    art: (
      <>
        <path d="M17 19l31 5-21 27z" fill="#fcd34d" />
        <path d="M17 19l31 5" stroke="#b45309" strokeWidth="5" strokeLinecap="round" />
        <circle cx="28" cy="28" r="3.3" fill="#dc2626" />
        <circle cx="37" cy="30" r="2.8" fill="#dc2626" />
        <circle cx="29" cy="38" r="2.8" fill="#dc2626" />
        <circle cx="33" cy="34" r="1" fill="#65a30d" />
        <circle cx="24" cy="33" r="1" fill="#65a30d" />
      </>
    ),
  },
  taco: {
    bg: ['#3f2a00', '#a16207'],
    art: (
      <>
        <circle cx="19" cy="31" r="4.5" fill="#4ade80" />
        <circle cx="27" cy="28" r="5" fill="#4ade80" />
        <circle cx="37" cy="28" r="5" fill="#4ade80" />
        <circle cx="45" cy="31" r="4.5" fill="#4ade80" />
        <circle cx="23" cy="28" r="2.6" fill="#ef4444" />
        <circle cx="41" cy="28" r="2.6" fill="#ef4444" />
        <circle cx="32" cy="27" r="2.4" fill="#fef3c7" />
        <path d="M13 31a19 19 0 0 0 38 0z" fill="#fbbf24" />
        <path d="M19 36a14 14 0 0 0 26 0" fill="none" stroke="#d97706" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  sushi: {
    bg: ['#042f2e', '#0f766e'],
    art: (
      <>
        <circle cx="32" cy="33" r="15" fill="#111827" />
        <circle cx="32" cy="33" r="11" fill="#f8fafc" />
        <circle cx="32" cy="33" r="5.5" fill="#fb7185" />
        <circle cx="36" cy="30" r="2" fill="#4ade80" />
        <circle cx="28" cy="36" r="1.6" fill="#fdba74" />
      </>
    ),
  },
  ramen: {
    bg: ['#1e1b4b', '#4338ca'],
    art: (
      <>
        <path d="M40 11L26 30M46 13L30 31" stroke="#d6d3d1" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="32" cy="32" rx="18" ry="4" fill="#fde68a" />
        <path d="M20 31c3-2 5 2 8 0s5 2 8 0 5 2 8 0" fill="none" stroke="#fef3c7" strokeWidth="1.6" />
        <ellipse cx="39" cy="31" rx="5" ry="3" fill="#fafafa" />
        <circle cx="39" cy="31" r="1.8" fill="#f59e0b" />
        <path d="M14 32a18 16 0 0 0 36 0z" fill="#ef4444" />
        <path d="M19 40h26" stroke="#fecaca" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  donut: {
    bg: ['#500724', '#be185d'],
    art: (
      <>
        <path fillRule="evenodd" d="M32 17a16 16 0 1 1 0 32 16 16 0 0 1 0-32zm0 10.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" fill="#f59e0b" />
        <path
          fillRule="evenodd"
          d="M32 19.5c7.5 0 13.5 5 13.5 12 0 3-2 3-2.5 5.5s-3 3.5-5 3.5-3 2.5-6 2.5-4.5-2-7-2.5-4.5-2.5-5-5-1.5-2-1.5-4.5c0-6.5 6-11.5 13.5-11.5zm0 8a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"
          fill="#f472b6"
        />
        <path d="M24 25l2.5 1M39 23l1.5 2M42 32l2.5-.5M23 34l-1 2.3M35 41l2 1.5M28 41l-2 1" stroke="#fef9c3" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M31 22l2.5-.5M38 36l1.5 2" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  croissant: {
    bg: ['#431407', '#9a3412'],
    art: (
      <>
        <path d="M12 40c2-14 14-21 20-21s18 7 20 21c-4-3-8-5-10-5-3 0-6 1-10 1s-7-1-10-1c-2 0-6 2-10 5z" fill="#f59e0b" />
        <path d="M24 22c-1 5 0 10 2 14M32 19v17M40 22c1 5 0 10-2 14" fill="none" stroke="#b45309" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M17 29c3 1 5 4 5 7M47 29c-3 1-5 4-5 7" fill="none" stroke="#b45309" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  coffee: {
    bg: ['#1c1917', '#57534e'],
    art: (
      <>
        {steam(26)}
        {steam(32)}
        <ellipse cx="30" cy="49" rx="17" ry="3" fill="#a8a29e" />
        <path d="M42 29h3a5 5 0 0 1 0 10h-3" fill="none" stroke="#fafaf9" strokeWidth="3" />
        <path d="M17 25h26v13a10 10 0 0 1-10 10h-6a10 10 0 0 1-10-10z" fill="#fafaf9" />
        <ellipse cx="30" cy="25" rx="13" ry="2.8" fill="#78350f" />
        <path d="M21 33v4a6 6 0 0 0 3 5" fill="none" stroke="#d6d3d1" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  icecream: {
    bg: ['#082f49', '#0369a1'],
    art: (
      <>
        <path d="M23 33h18l-9 20z" fill="#f59e0b" />
        <path d="M26 36l9 8M31 35l5 5M38 36l-9 8M33 35l-5 5" stroke="#b45309" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="26.5" cy="29" r="7" fill="#f9a8d4" />
        <circle cx="37.5" cy="29" r="7" fill="#6ee7b7" />
        <circle cx="32" cy="21" r="7" fill="#fef3c7" />
        <path d="M32 14c1-3 3-4 5-4" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="32" cy="13.5" r="2.6" fill="#ef4444" />
      </>
    ),
  },
  avocado: {
    bg: ['#052e16', '#15803d'],
    art: (
      <>
        <path d="M32 11c-8 0-12 10-13 18-2 12 4 23 13 23s15-11 13-23c-1-8-5-18-13-18z" fill="#365314" />
        <path d="M32 15.5c-6 0-9 8-9.5 14.5-1.5 10.5 3.5 18.5 9.5 18.5s11-8 9.5-18.5C41 23.5 38 15.5 32 15.5z" fill="#bef264" />
        <circle cx="32" cy="37" r="7" fill="#92400e" />
        <circle cx="30" cy="35" r="2" fill="#b45309" />
      </>
    ),
  },
  chili: {
    bg: ['#0c0a09', '#44403c'],
    art: (
      <>
        <path d="M20 23c11 0 26 8 28 25-6-8-17-12-26-16-6-3-7-9-2-9z" fill="#dc2626" />
        <path d="M24 25c7 1 15 5 19 11" fill="none" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
        <path d="M21 23c-1-4 1-8 6-9" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="21" cy="23.5" rx="4" ry="2.5" fill="#16a34a" />
      </>
    ),
  },
  lemon: {
    bg: ['#1a2e05', '#4d7c0f'],
    art: (
      <>
        <circle cx="32" cy="32" r="16" fill="#fde047" />
        <circle cx="32" cy="32" r="13" fill="#fef9c3" />
        <path d="M32 20v24M20 32h24M23.5 23.5l17 17M40.5 23.5l-17 17" stroke="#fde047" strokeWidth="2" />
        <circle cx="32" cy="32" r="2" fill="#fde047" />
      </>
    ),
  },
  egg: {
    bg: ['#172554', '#1d4ed8'],
    art: (
      <>
        <path d="M17 32c-2-10 8-16 16-14 10 2 16 10 12 20-3 8-16 12-23 7-4-3-4-8-5-13z" fill="#fafafa" />
        <circle cx="32" cy="32" r="7.5" fill="#f59e0b" />
        <circle cx="29.5" cy="29.5" r="2.2" fill="#fde68a" />
      </>
    ),
  },
  cheese: {
    bg: ['#2e1065', '#6d28d9'],
    art: (
      <>
        <path d="M13 37l29-14 9 14z" fill="#fde047" />
        <rect x="13" y="37" width="38" height="13" rx="1.5" fill="#facc15" />
        <circle cx="21" cy="43" r="2.6" fill="#ca8a04" />
        <circle cx="33" cy="44.5" r="3.2" fill="#ca8a04" />
        <circle cx="44" cy="42" r="2" fill="#ca8a04" />
        <ellipse cx="38" cy="31.5" rx="2.4" ry="1.4" fill="#ca8a04" />
      </>
    ),
  },
  shrimp: {
    bg: ['#083344', '#0e7490'],
    art: (
      <>
        <path d="M23 19c14-4 25 8 20 21-3 8-14 11-20 5" fill="none" stroke="#fb923c" strokeWidth="10" strokeLinecap="round" />
        <path d="M31 17.5l-1 9M39 21l-4 7M44 29l-7 3M43 38l-7-1M37 45l-4-5" stroke="#c2410c" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M23 45l-8 1 3 6z" fill="#f97316" />
        <circle cx="25" cy="19" r="1.6" fill="#1c1917" />
        <path d="M22 17c-5-2-9-1-12 2" fill="none" stroke="#fdba74" strokeWidth="1.2" strokeLinecap="round" />
      </>
    ),
  },
  whisk: {
    bg: ['#1e1b4b', '#6366f1'],
    art: (
      <>
        <path d="M32 41C20 29 22 11 32 11s12 18 0 30z" fill="none" stroke="#e7e5e4" strokeWidth="2" />
        <path d="M32 41c-6-11-5-27 0-30 5 3 6 19 0 30z" fill="none" stroke="#e7e5e4" strokeWidth="2" />
        <path d="M32 11v30" stroke="#e7e5e4" strokeWidth="2" />
        <rect x="29" y="40" width="6" height="14" rx="3" fill="#fbbf24" />
      </>
    ),
  },
  pot: {
    bg: ['#0f172a', '#334155'],
    art: (
      <>
        {steam(26)}
        {steam(38)}
        <rect x="9" y="32" width="8" height="4" rx="2" fill="#94a3b8" />
        <rect x="47" y="32" width="8" height="4" rx="2" fill="#94a3b8" />
        <rect x="15" y="28" width="34" height="21" rx="5" fill="#cbd5e1" />
        <path d="M15 40h34" stroke="#94a3b8" strokeWidth="1.6" />
        <ellipse cx="32" cy="27.5" rx="19" ry="3.5" fill="#e2e8f0" />
        <rect x="29" y="20" width="6" height="5" rx="2.5" fill="#f97316" />
      </>
    ),
  },
  cutlery: {
    bg: ['#4a044e', '#a21caf'],
    art: (
      <>
        <circle cx="32" cy="32" r="14" fill="#e7e5e4" />
        <circle cx="32" cy="32" r="10" fill="#fafaf9" />
        <path d="M11.5 14v8M14.5 14v8M17.5 14v8M11.5 22a3 3 0 0 0 6 0M14.5 25v25" fill="none" stroke="#f5d0fe" strokeWidth="2" strokeLinecap="round" />
        <path d="M50 14c4 4 4 13 0 17v19" fill="none" stroke="#f5d0fe" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M50 14c4 4 4 13 0 17z" fill="#f5d0fe" />
      </>
    ),
  },
  flame: {
    bg: ['#18181b', '#3f3f46'],
    art: (
      <>
        <path d="M32 11c4 8 14 12 14 25 0 9-6 16-14 16s-14-7-14-15c0-7 4-11 7-15 0 6 3 9 5 9-1-7 0-14 2-20z" fill="#f97316" />
        <path d="M32 29c2 4 7 7 7 12s-3 9-7 9-7-3-7-7c0-4 4-7 7-14z" fill="#fde68a" />
      </>
    ),
  },
}
