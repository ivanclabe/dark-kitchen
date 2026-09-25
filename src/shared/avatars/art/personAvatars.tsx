import type { PersonAvatarKey } from '../catalog'
import type { AvatarArt } from './accountIcons'
import { INK, SKIN } from './palette'
import { Body, Buttons, ChefHat, Face, Person, ShortHair } from './personParts'

/**
 * Avatares de personas (perfil). Mismo sistema que los iconos de
 * establecimiento: SVG propios, planos, cuadrícula de 64×64 y tarjeta oscura
 * con degradado. Todas las personas comparten el mismo busto (hombros, cuello,
 * cabeza y rostro), así el conjunto se ve coherente; cambian el tono de piel,
 * el pelo, la ropa y los accesorios.
 */

export const PERSON_AVATAR_ART: Record<PersonAvatarKey, AvatarArt> = {
  'chef-classic': {
    bg: ['#7c2d12', '#c2410c'],
    art: (
      <Person
        skin={SKIN.medium}
        shirt="#fafaf9"
        face={
          <>
            <Face smile={false} />
            <path d="M26.5 35.6c2-1.8 3.9-1.9 5.5-.6 1.6-1.3 3.5-1.2 5.5.6-1.9 1.3-3.8 1.4-5.5.4-1.7 1-3.6.9-5.5-.4z" fill="#57341f" />
          </>
        }
        top={<ChefHat y={1} />}
        extra={
          <>
            <path d="M27 46.5l5 5.5 5-5.5z" fill="#ef4444" />
            <Buttons />
          </>
        }
      />
    ),
  },
  'chef-bun': {
    bg: ['#042f2e', '#0f766e'],
    art: (
      <Person
        skin={SKIN.brown}
        shirt="#fafaf9"
        back={<circle cx="32" cy="15.5" r="5.5" fill="#1c1917" />}
        top={
          <>
            <ShortHair color="#1c1917" />
            <path d="M29 15.5h6" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          </>
        }
        extra={
          <>
            <circle cx="21.2" cy="34.6" r="1.1" fill="#fbbf24" />
            <circle cx="42.8" cy="34.6" r="1.1" fill="#fbbf24" />
            <path d="M24 47l8 7 8-7" fill="none" stroke="#d6d3d1" strokeWidth="1.6" />
            <Buttons />
          </>
        }
      />
    ),
  },
  baker: {
    bg: ['#1e3a8a', '#3b82f6'],
    art: (
      <Person
        skin={SKIN.light}
        shirt="#fde68a"
        back={<path d="M19.5 31c0 7 1 11 3 13h19c2-2 3-6 3-13z" fill="#92400e" />}
        top={
          <>
            <path d="M20.4 30C20 22 25 17 32 17s12 5 11.6 13c-3-3.2-7-4.8-11.6-4.8S23.4 26.8 20.4 30z" fill="#dc2626" />
            <circle cx="26" cy="21.5" r="1" fill="#fecaca" />
            <circle cx="32" cy="19.5" r="1" fill="#fecaca" />
            <circle cx="38" cy="21.5" r="1" fill="#fecaca" />
            <circle cx="29" cy="24" r="1" fill="#fecaca" />
            <circle cx="35" cy="24" r="1" fill="#fecaca" />
            <path d="M42.5 24.5l4.5-2.5-1 5 4 1.5-4.5 2z" fill="#b91c1c" />
          </>
        }
        extra={
          <>
            <path d="M22 64V52c0-2 1.5-3.5 3.5-3.5h13c2 0 3.5 1.5 3.5 3.5v12z" fill="#fffbeb" />
            <path d="M25.5 48.5l-2-2.5M38.5 48.5l2-2.5" stroke="#fffbeb" strokeWidth="2" strokeLinecap="round" />
          </>
        }
      />
    ),
  },
  barista: {
    bg: ['#1c1917', '#57534e'],
    art: (
      <Person
        skin={SKIN.tan}
        shirt="#e7e5e4"
        top={
          <>
            <path d="M20.5 28a11.5 10 0 0 1 23 0z" fill="#0f766e" />
            <path d="M20 27.5h-6a2 2 0 0 0 0 3h6.5z" fill="#115e59" />
            <circle cx="32" cy="18.5" r="1.3" fill="#115e59" />
          </>
        }
        extra={
          <>
            <path d="M23 64V50h18v14z" fill="#78350f" />
            <path d="M23 50l-3-4M41 50l3-4" stroke="#78350f" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M29 56c1-1.5 2-1.5 3 0s2 1.5 3 0" fill="none" stroke="#fbbf24" strokeWidth="1.3" strokeLinecap="round" />
          </>
        }
      />
    ),
  },
  rider: {
    bg: ['#052e16', '#15803d'],
    art: (
      <Person
        skin={SKIN.medium}
        shirt="#f97316"
        top={
          <>
            <path d="M18.5 35v-6a13.5 12.5 0 0 1 27 0v6h-3.2v-7c0-2-1.2-3.5-3.5-3.5H25.2c-2.3 0-3.5 1.5-3.5 3.5v7z" fill="#facc15" />
            <path d="M24 20.2c2.5-1.3 5-1.9 8-1.9" fill="none" stroke="#fef9c3" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="23" y="21.8" width="18" height="3" rx="1.5" fill="#1f2937" opacity=".85" />
          </>
        }
        extra={
          <>
            <path d="M32 47v17" stroke="#c2410c" strokeWidth="1.4" />
            <path d="M16 55h9M39 55h9" stroke="#fed7aa" strokeWidth="2" strokeLinecap="round" />
          </>
        }
      />
    ),
  },
  cashier: {
    bg: ['#2e1065', '#6d28d9'],
    art: (
      <Person
        skin={SKIN.deep}
        shirt="#a78bfa"
        back={<path d="M19 30c0-8 5.5-13 13-13s13 5 13 13v11c0 3-2 5-5 5H24c-3 0-5-2-5-5z" fill="#1c1917" />}
        top={
          <>
            <path d="M20.6 30C20 22.5 25 17.5 32 17.5s12 5 11.4 12.5c-3-2.5-7-4.4-11.4-4.4S23.6 27.5 20.6 30z" fill="#1c1917" />
            <path d="M19.5 31a12.5 13.5 0 0 1 25 0" fill="none" stroke="#e5e7eb" strokeWidth="1.8" />
            <rect x="17.3" y="28.5" width="4.4" height="6" rx="2" fill="#e5e7eb" />
            <path d="M20 34.5c1 3 3.5 4.5 7 4.5" fill="none" stroke="#e5e7eb" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="27.5" cy="39" r="1.2" fill="#e5e7eb" />
          </>
        }
        extra={<path d="M26 46.5l6 4.5 6-4.5" fill="none" stroke="#7c3aed" strokeWidth="1.6" />}
      />
    ),
  },
  'grill-master': {
    bg: ['#0c0a09', '#44403c'],
    art: (
      <Person
        skin={SKIN.light}
        shirt="#b91c1c"
        top={
          <>
            <ShortHair color="#78350f" />
            <path d="M21.5 31c0 8 4.5 12.5 10.5 12.5S42.5 39 42.5 31c-1.4 2.6-3 4-5 4.2-1.5-1.2-3.3-1.8-5.5-1.8s-4 .6-5.5 1.8c-2-.2-3.6-1.6-5-4.2z" fill="#78350f" />
            <path d="M29.5 37.2q2.5 1.3 5 0" fill="none" stroke="#fde68a" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
          </>
        }
        extra={
          <>
            <path d="M16 64V52M24 64V48M40 64V48M48 64V52" stroke="#7f1d1d" strokeWidth="1.4" />
            <path d="M12 56h40" stroke="#7f1d1d" strokeWidth="1.4" />
            <path d="M24 64V51h16v13z" fill="#292524" />
          </>
        }
      />
    ),
  },
  'sushi-chef': {
    bg: ['#083344', '#0e7490'],
    art: (
      <Person
        skin={SKIN.light}
        shirt="#f8fafc"
        top={
          <>
            <ShortHair color="#1c1917" />
            <rect x="20.5" y="23" width="23" height="4.2" rx="2" fill="#fafafa" />
            <circle cx="32" cy="25.1" r="2" fill="#dc2626" />
            <path d="M43 24.5l4-2.5-.5 4.5M43 26l4 2.5" stroke="#fafafa" strokeWidth="2" strokeLinecap="round" />
          </>
        }
        extra={<path d="M22 47.5l10 9 10-9M32 56.5V64" fill="none" stroke="#1e3a8a" strokeWidth="2.4" strokeLinejoin="round" />}
      />
    ),
  },
  pizzaiolo: {
    bg: ['#450a0a', '#991b1b'],
    art: (
      <Person
        skin={SKIN.medium}
        shirt="#fafaf9"
        face={
          <>
            <Face smile={false} />
            <path d="M27.5 35.5c1.6-1.3 3.2-1.4 4.5-.4 1.3-1 2.9-.9 4.5.4-1.5 1-3 1.1-4.5.3-1.5.8-3 .7-4.5-.3z" fill="#292524" />
          </>
        }
        top={
          <>
            <path d="M20 27c0-6 5.4-9.5 12-9.5S44 21 44 27z" fill="#15803d" />
            <path d="M19 27h26a1.5 1.5 0 0 1 0 3H19a1.5 1.5 0 0 1 0-3z" fill="#166534" />
            <path d="M24 21.5c2-1.5 5-2.3 8-2.3" fill="none" stroke="#4ade80" strokeWidth="1.4" strokeLinecap="round" />
          </>
        }
        extra={
          <>
            <path d="M26.5 46.5l5.5 6 5.5-6z" fill="#dc2626" />
            <path d="M29 47l3 3 3-3" fill="none" stroke="#fafaf9" strokeWidth=".9" />
          </>
        }
      />
    ),
  },
  manager: {
    bg: ['#0f172a', '#334155'],
    art: (
      <Person
        skin={SKIN.tan}
        shirt="#1e293b"
        top={
          <>
            <path d="M20.6 30c-.8-8 4.2-12.5 11.4-12.5s12.2 4.5 11.4 12.5c-.8-3.5-2.6-6-5.4-7.2-4.5 1.2-10.5 1.2-14.3-.8-1.7 1.8-2.7 4.6-3.1 8z" fill="#9ca3af" />
            <circle cx="28" cy="31" r="3.4" fill="none" stroke="#e5e7eb" strokeWidth="1.3" />
            <circle cx="36" cy="31" r="3.4" fill="none" stroke="#e5e7eb" strokeWidth="1.3" />
            <path d="M31.4 31h1.2M24.6 30.5l-3-.8M39.4 30.5l3-.8" stroke="#e5e7eb" strokeWidth="1.3" strokeLinecap="round" />
          </>
        }
        extra={
          <>
            <path d="M25 46.5l7 9 7-9z" fill="#f8fafc" />
            <path d="M30.5 49h3l1 9-2.5 3-2.5-3z" fill="#f97316" />
          </>
        }
      />
    ),
  },
  waiter: {
    bg: ['#4a044e', '#a21caf'],
    art: (
      <Person
        skin={SKIN.brown}
        shirt="#fafaf9"
        top={<path d="M20.6 30c-.9-8.5 4.5-13 11.4-13s12.3 4.5 11.4 13c-.8-2.4-2.1-4.4-4-5.6-3.8-.6-9.6-.7-15.4.8-1.7 1-2.9 2.8-3.4 4.8z" fill="#1c1917" />}
        extra={
          <>
            <path d="M10 64c0-9 6-15.5 14-17.2L28 64zM54 64c0-9-6-15.5-14-17.2L36 64z" fill="#27272a" />
            <path d="M26 48.5l6 2.5 6-2.5v5l-6-2.5-6 2.5z" fill="#dc2626" />
            <circle cx="32" cy="51" r="1.4" fill="#991b1b" />
          </>
        }
      />
    ),
  },
  grandma: {
    bg: ['#500724', '#be185d'],
    art: (
      <Person
        skin={SKIN.light}
        shirt="#fbcfe8"
        back={<circle cx="32" cy="16" r="5.5" fill="#e5e7eb" />}
        top={
          <>
            <path d="M20.6 30.5C20 22.5 25 17.5 32 17.5s12 5 11.4 13c-.8-3-2.5-5.5-5-6.7-2.5 1-4.5 1.4-6.4.3-1.9 1.1-3.9.7-6.4-.3-2.5 1.2-4.2 3.7-5 6.7z" fill="#e5e7eb" />
            <circle cx="28" cy="31" r="3.2" fill="none" stroke="#7c2d12" strokeWidth="1.2" />
            <circle cx="36" cy="31" r="3.2" fill="none" stroke="#7c2d12" strokeWidth="1.2" />
            <path d="M31.2 31h1.6" stroke="#7c2d12" strokeWidth="1.2" />
          </>
        }
        extra={
          <>
            <path d="M26 46.5c2 3 4 4.5 6 4.5s4-1.5 6-4.5" fill="none" stroke="#f9a8d4" strokeWidth="2" />
            <circle cx="32" cy="55" r="1.1" fill="#db2777" />
            <circle cx="32" cy="60" r="1.1" fill="#db2777" />
          </>
        }
      />
    ),
  },
  curly: {
    bg: ['#431407', '#92400e'],
    art: (
      <Person
        skin={SKIN.deep}
        shirt="#f59e0b"
        back={
          <>
            <circle cx="21" cy="25" r="5" fill={INK} />
            <circle cx="43" cy="25" r="5" fill={INK} />
            <circle cx="20" cy="31" r="4" fill={INK} />
            <circle cx="44" cy="31" r="4" fill={INK} />
          </>
        }
        top={
          <>
            <circle cx="25" cy="19.5" r="5" fill={INK} />
            <circle cx="32" cy="17" r="5.5" fill={INK} />
            <circle cx="39" cy="19.5" r="5" fill={INK} />
            <circle cx="22.5" cy="24" r="3.5" fill={INK} />
            <circle cx="41.5" cy="24" r="3.5" fill={INK} />
            <circle cx="28" cy="22.5" r="3" fill={INK} />
            <circle cx="36" cy="22.5" r="3" fill={INK} />
          </>
        }
        extra={<path d="M26 47c2 2.5 4 3.5 6 3.5s4-1 6-3.5" fill="none" stroke="#b45309" strokeWidth="2" />}
      />
    ),
  },
  hijab: {
    bg: ['#083344', '#0e7490'],
    art: (
      <>
        <path d="M17.5 36c0-12 6.5-20 14.5-20s14.5 8 14.5 20v10h-29z" fill="#fda4af" />
        <path d="M10 64c0-11 9.5-18 22-18s22 7 22 18z" fill="#fb7185" />
        <path d="M20 44c3 4 7.5 6 12 6s9-2 12-6l2 2c-3.5 5-8.5 7.5-14 7.5S21.5 51 18 46z" fill="#fda4af" />
        <circle cx="32" cy="31" r="10.5" fill={SKIN.tan} />
        <path d="M21 29.5c1-6.5 5.5-10 11-10s10 3.5 11 10c-3-3-6.5-4.2-11-4.2s-8 1.2-11 4.2z" fill="#fda4af" />
        <g transform="translate(0 1)">
          <Face />
        </g>
      </>
    ),
  },
  beanie: {
    bg: ['#172554', '#1d4ed8'],
    art: (
      <Person
        skin={SKIN.deep}
        shirt="#e11d48"
        top={
          <>
            <path d="M20 28.5a12 12.5 0 0 1 24 0z" fill="#facc15" />
            <rect x="19.5" y="25.5" width="25" height="5" rx="2.5" fill="#eab308" />
            <path d="M24 26v4M28 26v4M32 26v4M36 26v4M40 26v4" stroke="#ca8a04" strokeWidth="1" />
            <circle cx="32" cy="15" r="3.3" fill="#fef9c3" />
          </>
        }
        extra={<path d="M24.5 47c2.5 2.5 5 3.5 7.5 3.5s5-1 7.5-3.5" fill="none" stroke="#9f1239" strokeWidth="2" />}
      />
    ),
  },
  headphones: {
    bg: ['#1e1b4b', '#4338ca'],
    art: (
      <Person
        skin={SKIN.medium}
        shirt="#10b981"
        top={
          <>
            <path d="M21 29c-.3-7 4.6-11 11-11s11.3 4 11 11c-1.8-2.8-5.8-4.5-11-4.5S22.8 26.2 21 29z" fill="#3f2a1d" />
            <path d="M18.5 31a13.5 14.5 0 0 1 27 0" fill="none" stroke="#f472b6" strokeWidth="2.4" />
            <rect x="16" y="27.5" width="6" height="8.5" rx="3" fill="#f472b6" />
            <rect x="42" y="27.5" width="6" height="8.5" rx="3" fill="#f472b6" />
          </>
        }
        extra={
          <>
            <path d="M22 50c3 3 6.5 4.5 10 4.5s7-1.5 10-4.5" fill="none" stroke="#047857" strokeWidth="2" />
            <path d="M28 54v6M36 54v6" stroke="#d1fae5" strokeWidth="1.4" strokeLinecap="round" />
          </>
        }
      />
    ),
  },
  cap: {
    bg: ['#1a2e05', '#4d7c0f'],
    art: (
      <Person
        skin={SKIN.light}
        shirt="#3b82f6"
        back={<path d="M21 28c0 5 .5 9 2 11l1-10z" fill="#b45309" />}
        top={
          <>
            <path d="M20.5 28.5a11.5 10.5 0 0 1 23 0z" fill="#ef4444" />
            <path d="M31 27.5h15a2 2 0 0 1 0 4H31z" fill="#b91c1c" />
            <circle cx="32" cy="18.3" r="1.3" fill="#b91c1c" />
            <path d="M27 20.5c-2 1.8-3 4.3-3.3 7" fill="none" stroke="#fca5a5" strokeWidth="1.2" strokeLinecap="round" />
          </>
        }
        extra={<path d="M25 47c2 2.5 4.5 3.5 7 3.5s5-1 7-3.5" fill="none" stroke="#1d4ed8" strokeWidth="2" />}
      />
    ),
  },
  braids: {
    bg: ['#3f2a00', '#a16207'],
    art: (
      <Person
        skin={SKIN.deep}
        shirt="#fde047"
        top={
          <>
            <path d="M20.6 30C20 22.5 25 17.5 32 17.5s12 5 11.4 12.5c-1.5-3.5-3.6-5.5-6-6.3L32 21.5l-5.4 2.2c-2.4.8-4.5 2.8-6 6.3z" fill={INK} />
            <path d="M32 18v4" stroke="#44403c" strokeWidth="1" />
            {[34, 39, 44, 49, 54].map((y) => (
              <g key={y}>
                <ellipse cx="19.5" cy={y} rx="2.6" ry="3" fill={INK} />
                <ellipse cx="44.5" cy={y} rx="2.6" ry="3" fill={INK} />
              </g>
            ))}
            <circle cx="19.5" cy="58" r="1.8" fill="#ef4444" />
            <circle cx="44.5" cy="58" r="1.8" fill="#ef4444" />
          </>
        }
        extra={<path d="M26 47c2 2.5 4 3.5 6 3.5s4-1 6-3.5" fill="none" stroke="#ca8a04" strokeWidth="2" />}
      />
    ),
  },
  robot: {
    bg: ['#164e63', '#0891b2'],
    art: (
      <>
        <Body color="#94a3b8" />
        <rect x="26" y="50" width="12" height="7" rx="2" fill="#475569" />
        <circle cx="29" cy="53.5" r="1.2" fill="#22d3ee" />
        <circle cx="35" cy="53.5" r="1.2" fill="#f97316" />
        <rect x="28.5" y="39" width="7" height="8" fill="#64748b" />
        <rect x="18.5" y="28" width="3" height="7" rx="1.5" fill="#64748b" />
        <rect x="42.5" y="28" width="3" height="7" rx="1.5" fill="#64748b" />
        <rect x="20.5" y="21" width="23" height="20" rx="6" fill="#cbd5e1" />
        <rect x="23.5" y="26" width="17" height="8" rx="4" fill="#0f172a" />
        <circle cx="28" cy="30" r="1.8" fill="#22d3ee" />
        <circle cx="36" cy="30" r="1.8" fill="#22d3ee" />
        <path d="M27.5 37.5h9" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round" />
        <ChefHat y={2.5} scale={0.8} />
      </>
    ),
  },
  'cat-chef': {
    bg: ['#312e81', '#6366f1'],
    art: (
      <>
        <Body color="#fafaf9" />
        <Buttons />
        <path d="M27 46.5l5 5.5 5-5.5z" fill="#ef4444" />
        <rect x="27.5" y="37" width="9" height="11" rx="3.5" fill="#ea580c" />
        <path d="M21.5 25l-1.5-9 8 5zM42.5 25l1.5-9-8 5z" fill="#fb923c" />
        <path d="M22 22.5l-.8-4.5 4 2.5zM42 22.5l.8-4.5-4 2.5z" fill="#fdba74" />
        <circle cx="32" cy="31" r="11.5" fill="#fb923c" />
        <path d="M26 21.5l2 4M32 20v4.5M38 21.5l-2 4" stroke="#c2410c" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="32" cy="35.5" rx="5.5" ry="4" fill="#fed7aa" />
        <circle cx="27.5" cy="30.5" r="1.5" fill={INK} />
        <circle cx="36.5" cy="30.5" r="1.5" fill={INK} />
        <path d="M30.8 33.5h2.4l-1.2 1.4z" fill="#be185d" />
        <path d="M32 35v1.2M29.8 36.8q1.1 1 2.2 0 1.1 1 2.2 0" fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />
        <path d="M24.5 35l-5-1M24.5 37l-5 1M39.5 35l5-1M39.5 37l5 1" stroke="#fff7ed" strokeWidth=".9" strokeLinecap="round" />
        <ChefHat y={-1.5} scale={0.75} />
      </>
    ),
  },
}
