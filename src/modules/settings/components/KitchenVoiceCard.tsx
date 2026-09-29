import { setKitchenFeatureSettings, type FeatureSettings } from '@/shared/features/features'
import { FEATURES_KEY, useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { toVoiceSettings, type KitchenVoiceSettings } from '@/shared/voice/catalog'
import { DeviceVoicePanel } from '@/shared/voice/DeviceVoicePanel'
import { useVoiceProfiles } from '@/shared/voice/hooks'
import { VoicePreviewButtons, VoiceSettingsForm } from '@/shared/voice/VoiceSettingsForm'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import { FeatureStatusBadge, FeatureUnavailableNote } from './FeatureStatus'

const sameVoice = (a: KitchenVoiceSettings, b: KitchenVoiceSettings) =>
  a.profile === b.profile && a.style === b.style && a.rate === b.rate && a.volume === b.volume && a.lang === b.lang

/**
 * Kitchen voice of the account (ADR 0014, 9). Shows only what the
 * organization allows: its own voice when customization is on, the
 * organization's (read-only) when it is off, and nothing to activate.
 */
export function KitchenVoiceCard() {
  const { kitchen, feature } = useActiveKitchen()
  const state = feature('voice_speech')
  const { data: profiles } = useVoiceProfiles()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const saved = toVoiceSettings(state?.settings)
  const inherited = toVoiceSettings(state?.inheritedSettings)
  const [edited, setEdited] = useState<KitchenVoiceSettings | null>(null)
  const form = edited ?? saved

  const save = useMutation({
    mutationFn: (settings: FeatureSettings) => setKitchenFeatureSettings(kitchen.id, 'voice_speech', settings),
    onSuccess: async (_, settings) => {
      await queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
      setEdited(null)
      show(Object.keys(settings).length === 0 ? 'La cuenta vuelve a usar la voz de la organización.' : 'Voz de cocina guardada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar la voz'), 'error'),
  })

  if (!state) return null
  if (!state.usable && !state.enabled) {
    return (
      <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
        <div className="flex items-start justify-between gap-4">
          <h3 className={typography.h3}>Voz de cocina</h3>
          <FeatureStatusBadge state={state} />
        </div>
        <p className={clsx('mt-2', typography.small)}>La voz de cocina no está disponible para esta cuenta.</p>
        <FeatureUnavailableNote state={state} className="mt-1" />
      </div>
    )
  }

  const editable = state.canConfigure && state.usable
  const customized = !sameVoice(saved, inherited)

  return (
    <div className={clsx('space-y-5 rounded-2xl border bg-neutral-900/60 p-5', state.usable ? 'border-brasa-500/30' : 'border-neutral-800/60')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className={typography.h3}>Voz de cocina</h3>
          <p className={clsx('mt-1', typography.caption)}>Cómo suenan los avisos y respuestas en Cocina. Las frases son cortas: «Pedido 1042 listo.»</p>
          <FeatureUnavailableNote state={state} className="mt-2" />
        </div>
        <FeatureStatusBadge state={state} />
      </div>

      {editable ? (
        <>
          <VoiceSettingsForm value={form} onChange={setEdited} profiles={profiles} disabled={save.isPending} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {customized && !edited && (
              <Button variant="ghost" size="sm" onClick={() => save.mutate({})} loading={save.isPending}>
                Usar la voz de la organización
              </Button>
            )}
            {edited && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEdited(null)} disabled={save.isPending}>
                  Descartar
                </Button>
                <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate({ ...edited })}>
                  Guardar voz
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <p className={typography.small}>
            {state.accountOverride ? 'Tu rol no puede cambiar la voz de esta cuenta.' : 'Tu organización define la voz de todas sus cuentas.'}{' '}
            Se usa: <span className="text-neutral-100">{profiles?.find((p) => p.key === saved.profile)?.name ?? saved.profile}</span>.
          </p>
          <VoicePreviewButtons settings={saved} profiles={profiles} />
        </div>
      )}

      {state.usable && (
        <div className="border-t border-neutral-800/60 pt-4">
          <p className={clsx('mb-3', typography.overline)}>En este equipo</p>
          <DeviceVoicePanel lang={form.lang} />
        </div>
      )}
    </div>
  )
}
