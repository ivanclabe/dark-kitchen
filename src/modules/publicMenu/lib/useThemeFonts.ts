import { useEffect } from 'react'
import { themeFonts, type FontName, type ResolvedTheme } from './themes'

/**
 * Self-hosted faces (ADR 0071, Fontsource), one chunk per font: a menu downloads only its two.
 * Variable faces cover every weight; Poppins and DM Serif Display are static, latin and latin-ext only.
 * Inter is already in the app's main stylesheet (main.tsx).
 */
export const FONT_LOADERS: Record<FontName, () => Promise<unknown>> = {
  Inter: () => Promise.resolve(),
  Poppins: () =>
    Promise.all([
      import('@fontsource/poppins/latin-400.css'),
      import('@fontsource/poppins/latin-ext-400.css'),
      import('@fontsource/poppins/latin-500.css'),
      import('@fontsource/poppins/latin-ext-500.css'),
      import('@fontsource/poppins/latin-600.css'),
      import('@fontsource/poppins/latin-ext-600.css'),
      import('@fontsource/poppins/latin-700.css'),
      import('@fontsource/poppins/latin-ext-700.css'),
    ]),
  Nunito: () => import('@fontsource-variable/nunito/wght.css'),
  Montserrat: () => import('@fontsource-variable/montserrat/wght.css'),
  Lora: () => import('@fontsource-variable/lora/wght.css'),
  'Playfair Display': () => import('@fontsource-variable/playfair-display/wght.css'),
  'Cormorant Garamond': () => import('@fontsource-variable/cormorant-garamond/wght.css'),
  'DM Serif Display': () => Promise.all([import('@fontsource/dm-serif-display/latin-400.css'), import('@fontsource/dm-serif-display/latin-ext-400.css')]),
  Fraunces: () => import('@fontsource-variable/fraunces/wght.css'),
  Caveat: () => import('@fontsource-variable/caveat/wght.css'),
  'Plus Jakarta Sans': () => import('@fontsource-variable/plus-jakarta-sans/wght.css'),
  Outfit: () => import('@fontsource-variable/outfit/wght.css'),
  'Bricolage Grotesque': () => import('@fontsource-variable/bricolage-grotesque/wght.css'),
}

const requested = new Set<FontName>()

/** Loads a font once per page; a failed chunk (offline) can be retried later. */
export function loadThemeFont(font: FontName): void {
  if (requested.has(font)) return
  requested.add(font)
  FONT_LOADERS[font]().catch(() => requested.delete(font))
}

/** Loads only the two fonts of a theme (font-display: swap, as the Fontsource faces declare). */
export function useThemeFonts(theme: ResolvedTheme) {
  const fonts = themeFonts(theme)
  const key = fonts.join('|')
  useEffect(() => {
    for (const font of key.split('|') as FontName[]) loadThemeFont(font)
  }, [key])
}
