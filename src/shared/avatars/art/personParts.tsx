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

export const Face = ({ smile = true, cheeks = true }: { smile?: boolean; cheeks?: boolean }) => (
  <>
    <circle cx="28" cy="31" r="1.35" fill={INK} />
    <circle cx="36" cy="31" r="1.35" fill={INK} />
    {smile && <path d="M28.8 35.2q3.2 2.4 6.4 0" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />}
    {cheeks && (
      <>
        <circle cx="25.4" cy="34.3" r="1.8" fill="#fb7185" opacity=".35" />
        <circle cx="38.6" cy="34.3" r="1.8" fill="#fb7185" opacity=".35" />
      </>
    )}
  </>
)

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
