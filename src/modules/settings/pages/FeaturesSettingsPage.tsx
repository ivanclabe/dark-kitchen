import { CommandRecognitionPanel } from '@/modules/kitchen/voice/CommandRecognitionPanel'
import { WakeWordPanel } from '@/modules/kitchen/voice/WakeWordPanel'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { orgPath } from '@/shared/org/orgContext'
import { buttonClass } from '@/shared/ui/Button'
import { typography } from '@/shared/ui/typography'
import { toVoiceSettings } from '@/shared/voice/catalog'
import { DeviceVoicePanel } from '@/shared/voice/DeviceVoicePanel'
import { wakeWordTuning } from '@/shared/voice/wakeWord/tuning'
import clsx from 'clsx'
import { Building2, Mic, Volume2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FeatureStatusCard } from '../components/FeatureStatus'

/**
 * Voice on this device (ADR 0018). AI and voice are configured by the
 * organization; what is left here depends on each tablet: which voice it
 * speaks with, which recognizer it uses and whether it listens hands-free.
 * The status of each feature is shown read-only.
 */
export function FeaturesSettingsPage() {
  const { organization, feature, features } = useActiveKitchen()
  const speech = feature('voice_speech')
  const commands = feature('voice_commands')
  const wakeWord = feature('voice_wake_word')
  const canManageOrg = organization?.permissions.includes('features.manage') ?? false

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-4">
        <p className={clsx('flex min-w-0 items-start gap-2.5', typography.small)}>
          <Building2 size={16} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden />
          <span>
            La IA y la voz de esta cuenta las configura tu organización. Aquí ajustas solo lo que depende de <span className="text-neutral-200">este equipo</span>.
          </span>
        </p>
        {canManageOrg && organization && (
          <Link to={orgPath(organization.slug, '/ai')} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Abrir IA y voz de la organización
          </Link>
        )}
      </div>

      {speech?.usable && (
        <section className="space-y-3">
          <h2 className={clsx('flex items-center gap-2', typography.overline)}>
            <Volume2 size={13} aria-hidden /> Voz de cocina · En este equipo
          </h2>
          <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
            <DeviceVoicePanel lang={toVoiceSettings(speech.settings).lang} />
          </div>
        </section>
      )}

      {commands?.usable && (
        <section className="space-y-3">
          <h2 className={clsx('flex items-center gap-2', typography.overline)}>
            <Mic size={13} aria-hidden /> Comandos de voz · En este equipo
          </h2>
          <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
            <CommandRecognitionPanel />
            {wakeWord?.usable && (
              <div className="mt-5 border-t border-neutral-800/60 pt-4">
                <WakeWordPanel tuning={wakeWordTuning(wakeWord)} />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className={typography.overline}>Funciones de IA y voz en esta cuenta</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {features.map((state) => (
            <FeatureStatusCard key={state.key} state={state} />
          ))}
        </div>
      </section>
    </div>
  )
}
