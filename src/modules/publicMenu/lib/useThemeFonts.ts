import { useEffect } from 'react'
import { fontsHref, type ResolvedTheme } from './themes'

/** Loads only the two fonts of a theme (Google Fonts, display=swap), once per pair. */
export function useThemeFonts(theme: ResolvedTheme) {
  const href = fontsHref(theme)
  useEffect(() => {
    if (document.querySelector(`link[data-pm-fonts="${CSS.escape(href)}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.pmFonts = href
    document.head.appendChild(link)
  }, [href])
}
