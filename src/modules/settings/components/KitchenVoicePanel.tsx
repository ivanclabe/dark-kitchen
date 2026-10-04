import { accountFeaturesKey, useAccountFeatureMatrix } from '@/modules/organization/hooks/useAccountFeatures'
import { ScopeChoice, type SettingsScope } from '@/modules/organization/components/ScopeChoice'
import { setKitchenFeatureSettings, setOrganizationFeatureSettings } from '@/shared/features/features'
import { FEATURES_KEY, useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { toVoiceSettings, type KitchenVoiceSettings } from '@/shared/voice/catalog'
import { useVoiceProfiles } from '@/shared/voice/hooks'
import { VoiceSettingsForm } from '@/shared/voice/VoiceSettingsForm'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * Kitchen voice of the active account (ADR 0014, ADR 0018, ADR 0024): the
 * general voice applies to all your accounts; this account can have its own.
 * Starts from the platform default.
 */
export function KitchenVoicePanel({ organizationId }: { organizationId: string }) {
  const { kitchen } = useActiveKitchen()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data, isLoading, isError, error, refetch } = useAccountFeatureMatrix(kitchen.id)
  const { data: profiles } = useVoiceProfiles()
  const [edited, setEdited] = useState<KitchenVoiceSettings | null>(null)
  const [scope, setScope] = useState<SettingsScope | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: accountFeaturesKey(kitchen.id) })
    await queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
  }

  const saveGeneral = useMutation({
    mutationFn: (settings: Partial<KitchenVoiceSettings>) => setOrganizationFeatureSettings(organizationId, 'voice_speech', { ...settings }),
    onSuccess: async () => {
      await refresh()
      setEdited(null)
      show('Voz de cocina guardada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar la voz'), 'error'),
  })
  const saveOwn = useMutation({
    mutationFn: (settings: Partial<KitchenVoiceSettings>) => setKitchenFeatureSettings(kitchen.id, 'voice_speech', { ...settings }),
    onSuccess: async (_, settings) => {
      await refresh()
      setEdited(null)
      if (Object.keys(settings).length === 0) setScope('all')
      show(Object.keys(settings).length === 0 ? 'Esta cuenta vuelve a usar la voz general.' : 'Voz guardada solo para esta cuenta.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar la voz'), 'error'),
  })

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />
  const feature = data.features.find((f) => f.key === 'voice_speech')
  const account = data.accounts.find((a) => a.id === kitchen.id)
  if (!feature || !account) return null

  if (!feature.platformActive || !feature.includedInPlan) {
    return (
      <p className={typography.small}>
        {!feature.platformActive ? 'La plataforma tiene apagada la voz de cocina por ahora.' : 'Tu plan no incluye la voz de cocina.'}
      </p>
    )
  }

  const general = toVoiceSettings(feature.settings)
  const ownOverride = account.overrides?.voice_speech ?? {}
  const hasOwn = Object.keys(ownOverride).length > 0
  const shared = data.accountCount > 1
  const activeScope: SettingsScope = scope ?? (hasOwn ? 'account' : 'all')
  const ownScope = shared && activeScope === 'account'
  const base = ownScope ? toVoiceSettings({ ...feature.settings, ...ownOverride }) : general
  const form = edited ?? base
  const platformDefault = toVoiceSettings(feature.platformSettings)
  const profileName = (key: string) => profiles?.find((p) => p.key === key)?.name ?? key
  const busy = saveGeneral.isPending || saveOwn.isPending
  const enabledHere = feature.available && account.enabled.voice_speech === true
  /** Only what differs from the general voice is stored for the account. */
  const diff = (settings: KitchenVoiceSettings) =>
    Object.fromEntries(Object.entries(settings).filter(([k, v]) => general[k as keyof KitchenVoiceSettings] !== v)) as Partial<KitchenVoiceSettings>

  return (
    <div className="max-w-3xl space-y-6">
      <p className={typography.small}>
        La voz que escuchan los equipos de cocina de esta cuenta. Las frases son cortas y naturales («Pedido 1042 listo.»). La vista previa usa la voz de este equipo.
      </p>
      {!enabledHere && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          La voz de la aplicación está apagada en esta cuenta: actívala en la pestaña Funciones para que se escuche.
        </p>
      )}

      <section className="space-y-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
        {shared && (
          <div className="space-y-2">
            <ScopeChoice
              value={activeScope}
              onChange={(next) => {
                setScope(next)
                setEdited(null)
              }}
              disabled={busy}
            />
            <p className={typography.caption}>
              {ownScope
                ? hasOwn
                  ? 'Esta cuenta usa su propia voz.'
                  : 'Elige una voz distinta solo para esta cuenta; tus otras cuentas siguen con la general.'
                : `La voz general aplica a todas tus cuentas${hasOwn ? ' menos a esta, que tiene la suya' : ''}.`}
            </p>
          </div>
        )}
        <VoiceSettingsForm value={form} onChange={setEdited} profiles={profiles} disabled={busy} />
        <div className="flex flex-wrap justify-end gap-2">
          {!edited && ownScope && hasOwn && (
            <Button variant="ghost" size="sm" onClick={() => saveOwn.mutate({})} loading={saveOwn.isPending}>
              Usar la voz general
            </Button>
          )}
          {!edited && !ownScope && (
            <Button variant="ghost" size="sm" onClick={() => saveGeneral.mutate({})} loading={saveGeneral.isPending}>
              Usar la voz de la plataforma ({profileName(platformDefault.profile)})
            </Button>
          )}
          {edited && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEdited(null)} disabled={busy}>
                Descartar
              </Button>
              <Button variant="primary" size="sm" loading={busy} onClick={() => (ownScope ? saveOwn.mutate(diff(edited)) : saveGeneral.mutate({ ...edited }))}>
                {ownScope ? 'Guardar solo para esta cuenta' : shared ? 'Guardar para todas tus cuentas' : 'Guardar'}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
