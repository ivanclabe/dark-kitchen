import { AccountIcon } from '@/shared/avatars/Avatar'
import {
  FEATURE_CATEGORY_LABEL,
  fetchFeatureMatrix,
  setKitchenFeature,
  setOrganizationFeature,
  type FeatureCategory,
  type FeatureKey,
  type FeatureMatrix,
} from '@/shared/features/features'
import { FEATURES_KEY } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Lock, Mic, Sparkles, Store, Workflow } from 'lucide-react'
import { orgKey } from '../hooks/useOrganization'

const CATEGORY_ICON: Record<FeatureCategory, typeof Sparkles> = { ai: Sparkles, voice: Mic, general: Store }

/**
 * Funciones de la organización (ADR 0009, 3.2). Arriba de cada función, si la
 * organización la ofrece; debajo, en qué Cuentas está activada. La
 * organización es el techo: lo que no ofrece queda apagado en todas sus
 * Cuentas (la base lo exige), y lo que cada Cuenta había elegido se conserva.
 */
export function FeaturesPanel({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const matrixKey = [...orgKey(organizationId), 'features'] as const
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: matrixKey, queryFn: () => fetchFeatureMatrix(organizationId) })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: matrixKey })
    await queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
  }

  const setAvailable = useMutation({
    mutationFn: ({ key, available }: { key: FeatureKey; available: boolean }) => setOrganizationFeature(organizationId, key, available),
    onSuccess: refresh,
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })
  const setEnabled = useMutation({
    mutationFn: ({ accountId, key, enabled }: { accountId: string; key: FeatureKey; enabled: boolean }) => setKitchenFeature(accountId, key, enabled),
    onSuccess: refresh,
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />

  const categories = (['ai', 'voice', 'general'] as const).filter((c) => data.features.some((f) => f.category === c))
  const pending = setAvailable.isPending || setEnabled.isPending

  return (
    <div className="space-y-8">
      <p className={typography.small}>
        Decide qué funciones ofrece tu organización{data.plan ? ` (plan ${data.plan.name})` : ''} y en qué cuentas están activadas. Una cuenta no puede activar lo que la organización no ofrece. Los
        parámetros de cada función (umbrales, frecuencia) se ajustan dentro de cada cuenta, en Configuración → Funciones.
      </p>
      {data.accounts.length === 0 && <EmptyState icon={Store} title="Todavía no hay cuentas" description="Crea una cuenta para activar funciones en ella." compact />}
      {categories.map((category) => {
        const Icon = CATEGORY_ICON[category]
        return (
          <section key={category} className="space-y-3">
            <h2 className={clsx('flex items-center gap-2', typography.overline)}>
              <Icon size={13} aria-hidden /> {FEATURE_CATEGORY_LABEL[category]}
            </h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {data.features
                .filter((f) => f.category === category)
                .map((f) => (
                  <FeatureCard
                    key={f.key}
                    feature={f}
                    accounts={data.accounts}
                    disabled={pending}
                    onAvailable={(available) => setAvailable.mutate({ key: f.key, available })}
                    onEnabled={(accountId, enabled) => setEnabled.mutate({ accountId, key: f.key, enabled })}
                  />
                ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function FeatureCard({
  feature,
  accounts,
  disabled,
  onAvailable,
  onEnabled,
}: {
  feature: FeatureMatrix['features'][number]
  accounts: FeatureMatrix['accounts']
  disabled: boolean
  onAvailable: (available: boolean) => void
  onEnabled: (accountId: string, enabled: boolean) => void
}) {
  const activeIn = accounts.filter((a) => a.enabled[feature.key]).length
  return (
    <article className={clsx('space-y-4 rounded-2xl border bg-neutral-900/60 p-5', feature.available ? 'border-brasa-500/30' : 'border-neutral-800/60')}>
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
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {feature.includedInPlan ? (
            <>
              <Switch checked={feature.available} onChange={onAvailable} label={`Ofrecer ${feature.label} en la organización`} disabled={disabled} />
              <span className="text-[11px] text-neutral-500">{feature.available ? 'Disponible' : 'No disponible'}</span>
            </>
          ) : (
            // El plan no la incluye: no se puede ofrecer (la base lo exige igual).
            <Badge tone="neutral" size="sm" icon={Lock}>
              {feature.minPlan ? `Incluida en ${feature.minPlan}` : 'No incluida en tu plan'}
            </Badge>
          )}
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="space-y-2 border-t border-neutral-800/60 pt-3">
          <p className="text-xs text-neutral-500">
            {feature.available
              ? `Activada en ${activeIn} de ${accounts.length} ${accounts.length === 1 ? 'cuenta' : 'cuentas'}`
              : feature.includedInPlan
                ? 'Apagada en todas las cuentas mientras no esté disponible.'
                : 'Tu plan no la incluye: apagada en todas las cuentas.'}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {accounts.map((a) => {
              const enabled = a.enabled[feature.key]
              return (
                <li key={a.id} className={clsx('flex items-center gap-2.5 rounded-xl border border-neutral-800/60 px-3 py-2', !feature.available && 'opacity-60')}>
                  <AccountIcon iconKey={a.iconKey} seed={a.id} size="xs" className={a.active ? undefined : 'opacity-50'} />
                  <span className={clsx('min-w-0 flex-1 truncate text-sm', feature.available && enabled ? 'text-neutral-100' : 'text-neutral-500')}>{a.name}</span>
                  <Switch
                    checked={enabled}
                    onChange={(value) => onEnabled(a.id, value)}
                    label={`${feature.label} en ${a.name}`}
                    disabled={disabled || (!feature.available && !enabled)}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </article>
  )
}
