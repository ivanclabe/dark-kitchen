import { orgKey } from '@/modules/organization/hooks/useOrganization'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { fetchFeatureMatrix, setOrganizationFeatureSettings } from '@/shared/features/features'
import { FEATURES_KEY } from '@/shared/kitchen/activeKitchenContext'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { toVoiceSettings, type KitchenVoiceSettings } from '@/shared/voice/catalog'
import { useVoiceProfiles } from '@/shared/voice/hooks'
import { VoiceSettingsForm } from '@/shared/voice/VoiceSettingsForm'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'

/**
 * Kitchen voice of the organization (ADR 0014, 7): the default for all its
 * accounts and whether each account may customize it. Starts from the
 * platform default.
 */
export function OrgVoicePanel() {
  const { organization } = useOrgAdmin()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const matrixKey = [...orgKey(organization.id), 'features'] as const
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: matrixKey, queryFn: () => fetchFeatureMatrix(organization.id) })
  const { data: profiles } = useVoiceProfiles()
  const [edited, setEdited] = useState<{ settings: KitchenVoiceSettings; allowOverride: boolean } | null>(null)

  const save = useMutation({
    mutationFn: ({ settings, allowOverride }: { settings: Partial<KitchenVoiceSettings>; allowOverride: boolean }) =>
      setOrganizationFeatureSettings(organization.id, 'voice_speech', { ...settings, allow_account_override: allowOverride }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: matrixKey })
      await queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
      setEdited(null)
      show('Voz de cocina de la organización guardada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar la voz'), 'error'),
  })

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />
  const feature = data.features.find((f) => f.key === 'voice_speech')
  if (!feature) return null

  if (!feature.platformActive || !feature.includedInPlan) {
    return (
      <p className={typography.small}>
        {!feature.platformActive ? 'La plataforma tiene apagada la voz de cocina por ahora.' : 'Tu plan no incluye la voz de cocina.'}
      </p>
    )
  }

  const saved = { settings: toVoiceSettings(feature.settings), allowOverride: feature.accountOverride }
  const form = edited ?? saved
  const platformDefault = toVoiceSettings(feature.platformSettings)
  const customized = data.accounts.filter((a) => a.customized.includes('voice_speech'))

  return (
    <div className="max-w-3xl space-y-6">
      <p className={typography.small}>
        La voz que escuchan los equipos de cocina de todas tus cuentas. Las frases son cortas y naturales («Pedido 1042 listo.»). La vista previa usa la voz de este equipo.
      </p>
      {!feature.available && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Tu organización no ofrece la voz de la aplicación: actívala en la pestaña Funciones para que se escuche.
        </p>
      )}

      <section className="space-y-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
        <VoiceSettingsForm value={form.settings} onChange={(settings) => setEdited({ ...form, settings })} profiles={profiles} disabled={save.isPending} />
        <label className="flex items-start justify-between gap-4 border-t border-neutral-800/60 pt-4">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-neutral-100">Permitir que cada cuenta personalice su voz</span>
            <span className={typography.caption}>Si lo apagas, todas las cuentas usan esta voz. Lo que cada una había elegido se conserva.</span>
          </span>
          <Switch checked={form.allowOverride} onChange={(allowOverride) => setEdited({ ...form, allowOverride })} label="Permitir que cada cuenta personalice su voz" disabled={save.isPending} />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          {!edited && (
            <Button variant="ghost" size="sm" onClick={() => save.mutate({ settings: {}, allowOverride: form.allowOverride })} loading={save.isPending}>
              Usar la voz de la plataforma ({profiles?.find((p) => p.key === platformDefault.profile)?.name ?? platformDefault.profile})
            </Button>
          )}
          {edited && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEdited(null)} disabled={save.isPending}>
                Descartar
              </Button>
              <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate({ settings: { ...edited.settings }, allowOverride: edited.allowOverride })}>
                Guardar
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className={typography.h3}>Cuentas con voz propia</h3>
        {customized.length === 0 ? (
          <p className={typography.caption}>Todas las cuentas usan la voz de la organización.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {customized.map((a) => (
              <li key={a.id} className={clsx('flex items-center gap-2.5 rounded-xl border border-neutral-800/60 px-3 py-2', !form.allowOverride && 'opacity-60')}>
                <AccountIcon iconKey={a.iconKey} seed={a.id} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{a.name}</span>
                <Badge tone={form.allowOverride ? 'brand' : 'neutral'} size="sm">
                  {form.allowOverride ? 'Personalizada' : 'En pausa'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
