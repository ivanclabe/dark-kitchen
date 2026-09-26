import { setKitchenFeature, unavailableReason, type FeatureKey } from '@/shared/features/features'
import { FEATURES_KEY, useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'

/**
 * Una función sin parámetros (p. ej. la voz) con su interruptor para la
 * Cuenta. La base decide: si la organización no la ofrece, no se puede
 * activar (ADR 0009).
 */
export function FeatureSwitchCard({ featureKey }: { featureKey: FeatureKey }) {
  const { kitchen, feature } = useActiveKitchen()
  const state = feature(featureKey)
  const queryClient = useQueryClient()
  const { show } = useToast()

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setKitchenFeature(kitchen.id, featureKey, enabled),
    onSuccess: async (_, enabled) => {
      await queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
      show(`${state?.label ?? 'Función'}: ${enabled ? 'activada' : 'desactivada'}.`)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  if (!state) return null
  const reason = unavailableReason(state)

  return (
    <div className={clsx('flex items-start justify-between gap-4 rounded-2xl border bg-neutral-900/60 p-5', state.usable ? 'border-brasa-500/30' : 'border-neutral-800/60')}>
      <div className="min-w-0">
        <h3 className={typography.h3}>{state.label}</h3>
        <p className={clsx('mt-1', typography.caption)}>{state.description}</p>
        {reason === 'plan' && <p className="mt-2 text-xs text-amber-300">Tu plan no incluye esta función.</p>}
        {reason === 'organization' && (
          <p className="mt-2 text-xs text-amber-300">
            Tu organización no tiene disponible esta función{state.enabled ? ': queda apagada hasta que la ofrezca.' : '.'}
          </p>
        )}
      </div>
      <span className={clsx('shrink-0', !state.available && 'opacity-50')}>
        <Switch
          checked={state.enabled}
          onChange={(enabled) => toggle.mutate(enabled)}
          label={`Activar ${state.label}`}
          disabled={!state.canManage || toggle.isPending || (!state.available && !state.enabled)}
        />
      </span>
    </div>
  )
}
