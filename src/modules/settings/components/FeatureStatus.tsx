import { UNAVAILABLE_MESSAGE, unavailableReason, type FeatureState } from '@/shared/features/features'
import { Badge } from '@/shared/ui/Badge'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'

/**
 * Status of a feature in the active account, read-only (ADR 0014): the
 * account does not activate features; the organization does.
 */
export function FeatureStatusBadge({ state }: { state: FeatureState }) {
  const reason = unavailableReason(state)
  if (reason === null) return <Badge tone="success" size="sm" dot>Activa</Badge>
  if (reason === 'permission') return <Badge tone="neutral" size="sm" dot>Sin permiso</Badge>
  return <Badge tone="neutral" size="sm" dot>No disponible</Badge>
}

export function FeatureUnavailableNote({ state, className }: { state: FeatureState; className?: string }) {
  const reason = unavailableReason(state)
  if (reason === null) return null
  return <p className={clsx('text-xs text-amber-300', className)}>{UNAVAILABLE_MESSAGE[reason]}</p>
}

/** A feature without settings (e.g. voice commands): status only. */
export function FeatureStatusCard({ state }: { state: FeatureState }) {
  return (
    <div className={clsx('flex items-start justify-between gap-4 rounded-2xl border bg-neutral-900/60 p-5', state.usable ? 'border-brasa-500/30' : 'border-neutral-800/60')}>
      <div className="min-w-0">
        <h3 className={typography.h3}>{state.label}</h3>
        <p className={clsx('mt-1', typography.caption)}>{state.description}</p>
        <FeatureUnavailableNote state={state} className="mt-2" />
      </div>
      <span className="shrink-0">
        <FeatureStatusBadge state={state} />
      </span>
    </div>
  )
}
