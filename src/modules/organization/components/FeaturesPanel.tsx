import {
  FEATURE_CATEGORY_LABEL,
  setAccountFeature,
  type AccountFeatureMatrix,
  type FeatureKey,
} from '@/shared/features/features'
import { FEATURES_KEY } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Lock, Sparkles, Workflow } from 'lucide-react'
import { Section } from '@/shared/ui/Section'
import { cardClass } from '@/shared/ui/formClasses'
import { accountFeaturesKey, useAccountFeatureMatrix } from '../hooks/useAccountFeatures'
import { FeatureSettingsSection } from './FeatureSettings'

/**
 * ADR 0045: features the business does not manage. «Voz de la aplicación» is
 * always on with the platform's voice (the same in every account); only the
 * platform changes it (portal → Voz).
 */
const HIDDEN_FEATURES: readonly FeatureKey[] = ['voice_speech']

/**
 * Functions of the active account (ADR 0009, ADR 0018, ADR 0024): one switch
 * per feature for THIS account and its settings. Switching it on here never
 * switches it on in another account (the database guarantees it). Settings
 * can apply to all your accounts or only to this one.
 */
export function FeaturesPanel({
  organizationId,
  accountId,
}: {
  organizationId: string
  accountId: string
}) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data, isLoading, isError, error, refetch } = useAccountFeatureMatrix(accountId)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: accountFeaturesKey(accountId) })
    await queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
  }

  const setEnabled = useMutation({
    mutationFn: ({ key, enabled }: { key: FeatureKey; enabled: boolean }) => setAccountFeature(key, enabled),
    onSuccess: refresh,
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />
  const account = data.accounts.find((a) => a.id === accountId)
  if (!account) return <ErrorState error={new Error('No se encontró esta cuenta')} onRetry={() => void refetch()} />

  const features = data.features.filter((f) => !HIDDEN_FEATURES.includes(f.key))
  const categories = (['ai', 'voice', 'general'] as const).filter((c) => features.some((f) => f.category === c))

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <Section
          key={category}
          title={FEATURE_CATEGORY_LABEL[category]}
          description={category === 'ai' ? 'Activar una función aquí no la activa en tus otras cuentas.' : undefined}
        >
            <div className="space-y-3">
              {features
                .filter((f) => f.category === category)
                .map((f) => (
                  <FeatureCard
                    key={f.key}
                    feature={f}
                    account={account}
                    accountCount={data.accountCount}
                    organizationId={organizationId}
                    onChanged={refresh}
                    disabled={setEnabled.isPending}
                    onEnabled={(enabled) => setEnabled.mutate({ key: f.key, enabled })}
                  />
                ))}
            </div>
        </Section>
      ))}
    </div>
  )
}

function FeatureCard({
  feature,
  account,
  accountCount,
  organizationId,
  onChanged,
  disabled,
  onEnabled,
}: {
  feature: AccountFeatureMatrix['features'][number]
  account: AccountFeatureMatrix['accounts'][number]
  accountCount: number
  organizationId: string
  onChanged: () => Promise<unknown>
  disabled: boolean
  onEnabled: (enabled: boolean) => void
}) {
  const on = feature.available && account.enabled[feature.key] === true
  const platformOff = !feature.platformActive
  return (
    <article className={clsx(cardClass, 'space-y-4', platformOff && 'opacity-70')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={typography.h3}>{feature.label}</h3>
            {feature.category === 'ai' &&
              (feature.usesModel ? (
                <Badge tone="brand" size="sm" icon={Sparkles}>
                  IA
                </Badge>
              ) : (
                <Badge tone="neutral" size="sm" icon={Workflow}>
                  Regla fija
                </Badge>
              ))}
          </div>
          <p className={clsx('mt-1', typography.caption)}>{feature.description}</p>
          {feature.key === 'voice_wake_word' && <p className="mt-1 text-[11px] text-neutral-500">Necesita «Comandos de voz».</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {platformOff ? (
            // Switched off for the whole platform: nothing to decide here (the database refuses it too).
            <Badge tone="neutral" size="sm" icon={Lock}>
              Apagada por la plataforma
            </Badge>
          ) : feature.includedInPlan ? (
            <>
              <Switch checked={on} onChange={onEnabled} label={`${feature.label} en esta cuenta`} disabled={disabled} />
              <span className="text-[11px] text-neutral-500">{on ? 'Activa' : 'Apagada'}</span>
            </>
          ) : (
            // The plan does not include it: it cannot be switched on (the database refuses it too).
            <Badge tone="neutral" size="sm" icon={Lock}>
              {feature.minPlan ? `Incluida en ${feature.minPlan}` : 'No incluida en tu plan'}
            </Badge>
          )}
        </div>
      </div>

      {feature.platformActive && feature.includedInPlan && (
        <FeatureSettingsSection organizationId={organizationId} feature={feature} account={account} accountCount={accountCount} canEdit onChanged={onChanged} />
      )}
    </article>
  )
}
