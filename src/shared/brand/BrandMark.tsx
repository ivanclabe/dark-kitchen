import clsx from 'clsx'

/** The app icon of Quanela (public/icons, from the brand package). */
export const BRAND_ICON = '/icons/quanela-app-icon-128.png'
const BRAND_ICON_2X = '/icons/quanela-app-icon-256.png'

/**
 * The brand mark: the app icon, sized by its className (size-8, size-10…). Decorative next to the name
 * «Quanela»; pass a label when it stands alone.
 */
export function BrandMark({ className, label }: { className?: string; label?: string }) {
  return (
    <img
      src={BRAND_ICON}
      srcSet={`${BRAND_ICON} 1x, ${BRAND_ICON_2X} 2x`}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={clsx('size-10 shrink-0 select-none', className)}
    />
  )
}

/** The brand's own lettering «quanela» (docs/brand/quanela-wordmark.png, ADR 0070), used as a mask. */
export const BRAND_WORDMARK = '/brand/quanela-wordmark.webp'
/** Where the «q» ends in the wordmark (215 of 1431 px, plus half the gap to the «u»). */
const Q_END = 15.9

/**
 * The words-only logo: «quanela» in the brand lettering, taking the theme's text colour, with the «q» in the
 * brand orange like the full logo (ADR 0072). Its height comes from the className (h-5, h-6…).
 */
export function BrandWordmark({
  className,
  accent = true,
  color = 'bg-neutral-50',
}: {
  className?: string
  accent?: boolean
  /** The letters' colour as a background class: the theme's text by default; white on the orange panel. */
  color?: string
}) {
  const mask = { maskImage: `url(${BRAND_WORDMARK})`, WebkitMaskImage: `url(${BRAND_WORDMARK})`, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }
  return (
    <span role="img" aria-label="Quanela" className={clsx('relative inline-block aspect-[1431/353] h-5 shrink-0 select-none', className)}>
      <span className={clsx('absolute inset-0', color)} style={mask} aria-hidden />
      {accent && <span className="absolute inset-0 bg-brasa-500" style={{ ...mask, clipPath: `inset(0 ${100 - Q_END}% 0 0)` }} aria-hidden />}
    </span>
  )
}
