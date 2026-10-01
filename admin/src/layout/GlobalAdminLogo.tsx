import clsx from 'clsx'

/**
 * Quanela Global Admin mark (ADR 0019): Quanela's ember ring crossed by a
 * meridian — the whole platform, seen from above. Its own mark, so the portal
 * never looks like an organization inside Quanela.
 */
export function GlobalAdminMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id="ga-ember" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#111419" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke="#2a2f37" strokeWidth="3" />
      <circle cx="31" cy="31" r="15" fill="none" stroke="url(#ga-ember)" strokeWidth="5" />
      <ellipse cx="31" cy="31" rx="6.5" ry="15" fill="none" stroke="#94a3b8" strokeWidth="2" opacity=".8" />
      <path d="M40 40l9 9" stroke="url(#ga-ember)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

export function GlobalAdminLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <GlobalAdminMark size={compact ? 28 : 34} />
      <span className="leading-none">
        <span className="block text-sm font-semibold tracking-tight text-neutral-50">Quanela</span>
        <span className="mt-1 block font-mono text-[10px] font-medium tracking-[0.2em] text-brasa-400">GLOBAL ADMIN</span>
      </span>
    </span>
  )
}
