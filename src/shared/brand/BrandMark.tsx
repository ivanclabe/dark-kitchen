import clsx from 'clsx'

/** The app icon of Quanela (public/icons, from the brand package). */
export const BRAND_ICON = '/icons/quanela-app-icon-128.png'
const BRAND_ICON_2X = '/icons/quanela-app-icon-256.png'
/** The horizontal logo (mascot + wordmark), for light backgrounds. WebP: 28 KB instead of the 123 KB PNG, which stays for other uses. */
export const BRAND_LOGO = '/brand/quanela-logo-horizontal.webp'

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

/** The horizontal logo; its height comes from the className (h-8, h-9…). */
export function BrandLogo({ className }: { className?: string }) {
  return <img src={BRAND_LOGO} alt="Quanela" draggable={false} className={clsx('h-9 w-auto select-none', className)} />
}
