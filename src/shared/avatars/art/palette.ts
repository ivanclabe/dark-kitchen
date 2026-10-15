/**
 * Colores de la galería (ADR 0062). Los rasgos usan el café de la marca; las tarjetas, seis tonos de la familia
 * de Quanela (naranja, café y crema, con dos fríos suaves para que los iconos se distingan entre sí).
 */
export const INK = '#1c1310'

export const SKIN = {
  light: '#f8d7bd',
  medium: '#e8b48c',
  tan: '#c98b5b',
  brown: '#8d5a3b',
  deep: '#5e3a26',
} as const

/** The card behind each icon or avatar: [top-left, bottom-right]. */
export const TONES = {
  brasa: ['#fdba74', '#ea580c'],
  terracota: ['#f4a582', '#c2410c'],
  cafe: ['#5a4031', '#1c1310'],
  crema: ['#fff4e6', '#f8d2ad'],
  salvia: ['#e3eedb', '#a9c8a2'],
  cielo: ['#e4edf5', '#a9c2dc'],
} as const satisfies Record<string, readonly [string, string]>

export type Tone = keyof typeof TONES
