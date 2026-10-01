import { orgKey } from '@/modules/organization/hooks/useOrganization'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { fetchFeatureMatrix, setKitchenFeatureSettings, setOrganizationFeatureSettings } from '@/shared/features/features'
import { FEATURES_KEY } from '@/shared/kitchen/activeKitchenContext'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { Button } from '@/shared/ui/Button'
import { Select } from '@/shared/ui/FormField'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { toVoiceSettings, type KitchenVoiceSettings } from '@/shared/voice/catalog'
import { useVoiceProfiles } from '@/shared/voice/hooks'
import { VoiceSettingsForm } from '@/shared/voice/VoiceSettingsForm'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'

/**
 * Kitchen voice of the organization (ADR 0014, ADR 0018): the voice of all
 * its accounts and, only where needed, a different voice for one account.
 * Accounts no longer change it themselves. Starts from the platform default.
 */
export function OrgVoicePanel() {
  const { organization } = useOrgAdmin()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const matrixKey = [...orgKey(organization.id), 'features'] as const
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: matrixKey, queryFn: () => fetchFeatureMatrix(organization.id) })
  const { data: profiles } = useVoiceProfiles()
  const [edited, setEdited] = useState<KitchenVoiceSettings | null>(null)
  const [exception, setException] = useState<{ accountId: string; settings: KitchenVoiceSettings } | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: matrixKey })
    await queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
  }

  const save = useMutation({
    mutationFn: (settings: Partial<KitchenVoiceSettings>) => setOrganizationFeatureSettings(organization.id, 'voice_speech', { ...settings }),
    onSuccess: async () => {
      await refresh()
      setEdited(null)
      show('Voz de cocina de la organización guardada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar la voz'), 'error'),
  })
  const saveAccount = useMutation({
    mutationFn: ({ accountId, settings }: { accountId: string; settings: Partial<KitchenVoiceSettings> }) => setKitchenFeatureSettings(accountId, 'voice_speech', { ...settings }),
    onSuccess: async (_, { settings }) => {
      await refresh()
      setException(null)
      show(Object.keys(settings).length === 0 ? 'La cuenta vuelve a usar la voz de la organización.' : 'Voz de la cuenta guardada.')
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

  const saved = toVoiceSettings(feature.settings)
  const form = edited ?? saved
  const platformDefault = toVoiceSettings(feature.platformSettings)
  const profileName = (key: string) => profiles?.find((p) => p.key === key)?.name ?? key
  const withVoice = data.accounts.filter((a) => Object.keys(a.overrides?.voice_speech ?? {}).length > 0)
  const withoutVoice = data.accounts.filter((a) => !withVoice.includes(a))
  /** Only what differs from the organization voice is stored for the account. */
  const diff = (settings: KitchenVoiceSettings) =>
    Object.fromEntries(Object.entries(settings).filter(([k, v]) => saved[k as keyof KitchenVoiceSettings] !== v)) as Partial<KitchenVoiceSettings>

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
        <VoiceSettingsForm value={form} onChange={setEdited} profiles={profiles} disabled={save.isPending} />
        <div className="flex flex-wrap justify-end gap-2">
          {!edited && (
            <Button variant="ghost" size="sm" onClick={() => save.mutate({})} loading={save.isPending}>
              Usar la voz de la plataforma ({profileName(platformDefault.profile)})
            </Button>
          )}
          {edited && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEdited(null)} disabled={save.isPending}>
                Descartar
              </Button>
              <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate({ ...edited })}>
                Guardar
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className={typography.h3}>Voz distinta por cuenta</h3>
        {withVoice.length === 0 && !exception && <p className={typography.caption}>Todas las cuentas usan la voz de la organización.</p>}
        <ul className="space-y-2">
          {withVoice.map((a) => {
            const own = toVoiceSettings({ ...feature.settings, ...a.overrides?.voice_speech })
            const editing = exception?.accountId === a.id
            return (
              <li key={a.id} className="rounded-xl border border-neutral-800/60 px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <AccountIcon iconKey={a.iconKey} seed={a.id} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-neutral-100">{a.name}</span>
                    <span className="block truncate text-[11px] text-brasa-300">{profileName(own.profile)} · {own.style}</span>
                  </span>
                  {!editing && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setException({ accountId: a.id, settings: own })} disabled={saveAccount.isPending}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => saveAccount.mutate({ accountId: a.id, settings: {} })} disabled={saveAccount.isPending}>
                        Quitar
                      </Button>
                    </>
                  )}
                </div>
                {editing && exception && <AccountVoiceForm value={exception.settings} profiles={profiles} saving={saveAccount.isPending} onChange={(settings) => setException({ ...exception, settings })} onCancel={() => setException(null)} onSave={() => saveAccount.mutate({ accountId: a.id, settings: diff(exception.settings) })} />}
              </li>
            )
          })}
          {exception && !withVoice.some((a) => a.id === exception.accountId) && (
            <li className="rounded-xl border border-brasa-500/30 px-3 py-2">
              <p className="text-sm text-neutral-100">{data.accounts.find((a) => a.id === exception.accountId)?.name}</p>
              <AccountVoiceForm value={exception.settings} profiles={profiles} saving={saveAccount.isPending} onChange={(settings) => setException({ ...exception, settings })} onCancel={() => setException(null)} onSave={() => saveAccount.mutate({ accountId: exception.accountId, settings: diff(exception.settings) })} />
            </li>
          )}
        </ul>
        {!exception && withoutVoice.length > 0 && data.accounts.length > 1 && (
          <div className="flex items-center gap-2">
            <Plus size={13} className="text-neutral-500" aria-hidden />
            <Select aria-label="Elegir una voz distinta para una cuenta" value="" onChange={(e) => e.target.value && setException({ accountId: e.target.value, settings: saved })} className="!mt-0 max-w-xs">
              <option value="">Voz distinta para una cuenta…</option>
              {withoutVoice.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </section>
    </div>
  )
}

function AccountVoiceForm({
  value,
  profiles,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  value: KitchenVoiceSettings
  profiles: Parameters<typeof VoiceSettingsForm>[0]['profiles']
  saving: boolean
  onChange: (settings: KitchenVoiceSettings) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="mt-3 space-y-3 border-t border-neutral-800/60 pt-3">
      <VoiceSettingsForm value={value} onChange={onChange} profiles={profiles} disabled={saving} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} loading={saving}>
          Guardar voz de la cuenta
        </Button>
      </div>
    </div>
  )
}
