import { productImageUrl } from '@/modules/products/lib/productImages'
import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { themeStyle, type ResolvedTheme } from '../lib/themes'
import { useThemeFonts } from '../lib/useThemeFonts'

const WIDE = 640

/**
 * Whether the page is wide (the `pm-wide:` variant): the window on the
 * public page, the frame itself in the editor preview (a phone frame on a
 * big screen must still look like a phone).
 */
function useWide(contained: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(() => !contained && typeof window !== 'undefined' && window.matchMedia?.(`(min-width: ${WIDE}px)`).matches === true)
  useEffect(() => {
    if (contained) {
      const el = ref.current
      if (!el || typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE))
      observer.observe(el)
      return () => observer.disconnect()
    }
    const query = window.matchMedia?.(`(min-width: ${WIDE}px)`)
    if (!query) return
    const onChange = () => setWide(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [contained])
  return [ref, wide] as const
}

/**
 * The root of a themed page (ADR 0053): CSS variables, background and fonts.
 * The page, the editor preview and the template thumbnails all use it.
 * `contained` keeps fixed elements (cart bar, sheet) inside the preview frame:
 * the outer box is their containing block, the inner one scrolls.
 */
export function ThemeRoot({ theme, contained = false, className, children }: { theme: ResolvedTheme; contained?: boolean; className?: string; children: ReactNode }) {
  useThemeFonts(theme)
  const [ref, wide] = useWide(contained)
  const style = themeStyle(theme, productImageUrl)
  if (contained)
    return (
      <div
        ref={ref}
        data-template={theme.template}
        data-pm-wide={wide || undefined}
        style={{ ...style, transform: 'translateZ(0)', backgroundAttachment: undefined }}
        className={clsx('pm-root relative h-full overflow-hidden', className)}
      >
        <div className="h-full overflow-y-auto">{children}</div>
      </div>
    )
  return (
    <div ref={ref} data-template={theme.template} data-pm-wide={wide || undefined} style={style} className={clsx('pm-root flow-root min-h-dvh', className)}>
      {children}
    </div>
  )
}
