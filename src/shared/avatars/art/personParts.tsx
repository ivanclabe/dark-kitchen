import type { ReactNode } from 'react'
import { INK } from './palette'

/**
 * Piezas del busto común de los avatares de personas (hombros, cuello,
 * cabeza, rostro) y accesorios repetidos. Mismo sistema que los iconos de
 * establecimiento: cuadrícula de 64×64, formas planas.
 */

const BODY = 'M10 64c0-11 9.5-18 22-18s22 7 22 18z'

export const Body = ({ color }: { color: string }) => <path d={BODY} fill={color} />

export const Neck = ({ skin }: { skin: string }) => (
  <>
    <rect x="27.5" y="37" width="9" height="11" rx="3.5" fill={skin} />
    <path d="M27.5 40.5c3 2 6 2 9 0V38h-9z" fill="#000" opacity=".14" />
  </>
)

export const Head = ({ skin, ears = true }: { skin: string; ears?: boolean }) => (
  <>
    {ears && (
      <>
        <circle cx="21.2" cy="31" r="2.7" fill={skin} />
        <circle cx="42.8" cy="31" r="2.7" fill={skin} />
      </>
    )}
    <circle cx="32" cy="30" r="11" fill={skin} />
  </>
)

export type Eyes = 'happy' | 'dot' | 'wink' | 'closed' | 'wide'
export type Mouth = 'smile' | 'grin' | 'flat' | 'o' | 'smirk' | 'none'

/**
 * The face of a person (ADR 0062). Each avatar has its own expression, so the gallery is not a row of identical
 * smiles: happy arcs like the robot of Quanela, plain dots, a wink, eyes closed, wide open; a smile, a grin, a
 * straight line, an «o», a half smile. `smile={false}` keeps the old «no mouth» (for a mustache on top).
 */
export const Face = ({ eyes = 'dot', mouth = 'smile', smile = true, cheeks = true }: { eyes?: Eyes; mouth?: Mouth; smile?: boolean; cheeks?: boolean }) => {
  const line = { fill: 'none', stroke: INK, strokeWidth: 1.5, strokeLinecap: 'round' as const }
  const m = smile ? mouth : 'none'
  return (
    <>
      {eyes === 'happy' && <path d="M26.5 31.6q1.5-2 3 0M34.5 31.6q1.5-2 3 0" {...line} />}
      {eyes === 'closed' && <path d="M26.5 30.6q1.5 1.8 3 0M34.5 30.6q1.5 1.8 3 0" {...line} />}
      {eyes === 'dot' && (
        <>
          <circle cx="28" cy="31" r="1.35" fill={INK} />
          <circle cx="36" cy="31" r="1.35" fill={INK} />
        </>
      )}
      {eyes === 'wide' && (
        <>
          <circle cx="28" cy="30.8" r="1.9" fill={INK} />
          <circle cx="36" cy="30.8" r="1.9" fill={INK} />
          <circle cx="28.6" cy="30.2" r=".6" fill="#fff" />
          <circle cx="36.6" cy="30.2" r=".6" fill="#fff" />
        </>
      )}
      {eyes === 'wink' && (
        <>
          <circle cx="28" cy="31" r="1.35" fill={INK} />
          <path d="M34.5 31.6q1.5-2 3 0" {...line} />
        </>
      )}
      {m === 'smile' && <path d="M28.8 35.2q3.2 2.4 6.4 0" {...line} strokeWidth={1.4} />}
      {m === 'grin' && <path d="M28.6 34.6h6.8q-.4 3.6-3.4 3.6t-3.4-3.6z" fill={INK} />}
      {m === 'grin' && <path d="M30 37q2 1 4 0" fill="none" stroke="#fb7185" strokeWidth="1" strokeLinecap="round" />}
      {m === 'flat' && <path d="M29.6 35.8h4.8" {...line} strokeWidth={1.4} />}
      {m === 'o' && <ellipse cx="32" cy="36" rx="1.5" ry="1.8" fill={INK} />}
      {m === 'smirk' && <path d="M29.5 35.8q2.8 1.2 5.6-1" {...line} strokeWidth={1.4} />}
      {cheeks && (
        <>
          <circle cx="25.4" cy="34.3" r="1.8" fill="#fb7185" opacity=".35" />
          <circle cx="38.6" cy="34.3" r="1.8" fill="#fb7185" opacity=".35" />
        </>
      )}
    </>
  )
}

/** Pelo corto (encima de la cabeza). */
export const ShortHair = ({ color }: { color: string }) => (
  <path d="M20.6 30.5C20 22.5 25 17.5 32 17.5s12 5 11.4 13c-1.4-3.6-3.8-5.8-6.9-6.2-2.6 1.3-6.6 1.8-10 1.1-3 .4-4.7 2.4-5.9 5.1z" fill={color} />
)

/** Persona completa: fondo del pelo, cuerpo, cuello, cabeza, rostro y lo que va encima. */
export function Person({ skin, shirt, back, top, extra, face }: { skin: string; shirt: string; back?: ReactNode; top?: ReactNode; extra?: ReactNode; face?: ReactNode }) {
  return (
    <>
      {back}
      <Body color={shirt} />
      <Neck skin={skin} />
      <Head skin={skin} />
      {face ?? <Face />}
      {top}
      {extra}
    </>
  )
}

export const ChefHat = ({ y = 0, scale = 1 }: { y?: number; scale?: number }) => (
  <g transform={`translate(32 ${y}) scale(${scale}) translate(-32 0)`}>
    <circle cx="24.5" cy="14.5" r="6" fill="#fff7ed" />
    <circle cx="32" cy="11" r="7.5" fill="#fff7ed" />
    <circle cx="39.5" cy="14.5" r="6" fill="#fff7ed" />
    <rect x="22" y="14" width="20" height="8" rx="2" fill="#fff7ed" />
    <rect x="22" y="19" width="20" height="4" rx="1.5" fill="#fed7aa" />
  </g>
)

export const Buttons = ({ color = '#a8a29e' }: { color?: string }) => (
  <>
    <circle cx="28.5" cy="55" r="1" fill={color} />
    <circle cx="35.5" cy="55" r="1" fill={color} />
    <circle cx="28.5" cy="60" r="1" fill={color} />
    <circle cx="35.5" cy="60" r="1" fill={color} />
  </>
)

export type RobotEyes = 'happy' | 'wink' | 'love' | 'idea' | 'surprised' | 'sleepy'

/**
 * The mascot of Quanela (ADR 0060/0062): white head, dark visor, orange chef hat; its eyes carry the same
 * expressions as the robot icons of the app (happy, wink, in love, an idea, surprised, asleep).
 */
export function QuanelaRobot({ eyes }: { eyes: RobotEyes }) {
  const glow = '#fb923c'
  const line = { fill: 'none', stroke: glow, strokeWidth: 1.7, strokeLinecap: 'round' as const }
  const heart = (x: number) => <path d={`M${x} 32.6l-2.1-2.1a1.3 1.3 0 0 1 2.1-1.6 1.3 1.3 0 0 1 2.1 1.6z`} fill={glow} />
  return (
    <>
      <Body color="#f97316" />
      <path d="M24 47.5c2.5 3 5.2 4.5 8 4.5s5.5-1.5 8-4.5" fill="none" stroke="#fff7ed" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="29" cy="56" r="1.2" fill="#fff7ed" />
      <circle cx="35" cy="56" r="1.2" fill="#fff7ed" />
      <rect x="28.5" y="39" width="7" height="8" rx="2" fill="#e7ddd3" />
      <path d="M20 25v-6" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="20" cy="18" r="2.2" fill="#f97316" />
      <rect x="17.5" y="27" width="4" height="9" rx="2" fill="#ea580c" />
      <rect x="42.5" y="27" width="4" height="9" rx="2" fill="#ea580c" />
      <rect x="19.5" y="21" width="25" height="21" rx="8" fill="#fffaf5" />
      <rect x="22.5" y="25" width="19" height="12" rx="5.5" fill={INK} />
      {eyes === 'happy' && <path d="M25.6 32.2q1.9-2.6 3.8 0M34.6 32.2q1.9-2.6 3.8 0" {...line} />}
      {eyes === 'wink' && <path d="M25.6 32.2q1.9-2.6 3.8 0M34.6 31.2h3.8" {...line} />}
      {eyes === 'love' && (
        <>
          {heart(27.5)}
          {heart(36.5)}
        </>
      )}
      {eyes === 'idea' && (
        <>
          <path d="M25.6 32.2q1.9-2.6 3.8 0M34.6 32.2q1.9-2.6 3.8 0" {...line} />
          <circle cx="50" cy="20" r="4" fill="#facc15" />
          <rect x="48.4" y="23.2" width="3.2" height="2.6" rx=".8" fill="#a8a29e" />
          <path d="M50 12.5v-2M55.5 15l1.4-1.4M44.5 15l-1.4-1.4" stroke="#facc15" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {eyes === 'surprised' && (
        <>
          <circle cx="27.5" cy="31" r="2.1" fill="none" stroke={glow} strokeWidth="1.6" />
          <circle cx="36.5" cy="31" r="2.1" fill="none" stroke={glow} strokeWidth="1.6" />
          <path d="M51 13v6" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="51" cy="22.5" r="1.3" fill="#f97316" />
        </>
      )}
      {eyes === 'sleepy' && (
        <>
          <path d="M25.6 31.2q1.9 1.8 3.8 0M34.6 31.2q1.9 1.8 3.8 0" {...line} />
          <path d="M47 14h4l-4 4.5h4M52.5 8.5h3l-3 3.4h3" fill="none" stroke="#c2410c" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      <g transform="translate(32 2.5) scale(0.82) translate(-32 0)">
        <circle cx="24.5" cy="14.5" r="6" fill="#f97316" />
        <circle cx="32" cy="11" r="7.5" fill="#fb923c" />
        <circle cx="39.5" cy="14.5" r="6" fill="#f97316" />
        <rect x="22" y="14" width="20" height="8" rx="2" fill="#f97316" />
        <rect x="22" y="19" width="20" height="4" rx="1.5" fill="#ea580c" />
      </g>
    </>
  )
}
