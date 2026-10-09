import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import { Building2, Star } from 'lucide-react'
import type { CustomerIdentity } from '../types'

/**
 * ADR 0044: the same marks everywhere a customer appears — the list, the
 * sheet, the order picker and the order detail. ⭐ «Preferencial» (with the
 * business's reason on hover) and the building for a company.
 */
export function PreferredBadge({ note, compact = false, className }: { note?: string | null; compact?: boolean; className?: string }) {
  const badge = (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 font-medium text-amber-300',
        compact ? 'p-0.5' : 'px-2 py-0.5 text-[11px]',
        className,
      )}
      aria-label={compact ? `Cliente preferencial${note ? `: ${note}` : ''}` : undefined}
    >
      <Star size={compact ? 11 : 12} className="fill-amber-400 text-amber-400" aria-hidden />
      {!compact && 'Preferencial'}
    </span>
  )
  return note ? (
    <Tooltip label={note} side="top">
      {badge}
    </Tooltip>
  ) : (
    badge
  )
}

export function CompanyIcon({ className }: { className?: string }) {
  return <Building2 size={13} className={clsx('shrink-0 text-sky-400', className)} aria-label="Empresa" />
}

/** The marks of a customer next to its name: company and preferred (nothing for a plain person). */
export function CustomerMarks({ customer, compact = false }: { customer: CustomerIdentity; compact?: boolean }) {
  if (customer.type !== 'company' && !customer.preferred) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {customer.type === 'company' && <CompanyIcon />}
      {customer.preferred && <PreferredBadge note={customer.preferredNote} compact={compact} />}
    </span>
  )
}
