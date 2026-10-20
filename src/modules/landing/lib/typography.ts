import type { CSSProperties } from 'react'

/** The display face of the landing's headings (loaded only on the landing, self-hosted): rounded and bold, like the logo. */
export const loadDisplayFont = () => import('@fontsource-variable/nunito/wght.css')
export const display: CSSProperties = { fontFamily: "'Nunito Variable', 'Nunito', ui-rounded, ui-sans-serif, system-ui, sans-serif" }
