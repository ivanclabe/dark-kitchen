import { AiSettingsPage } from '@/modules/ai/pages/AiSettingsPage'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { Mic, Sparkles } from 'lucide-react'
import { FeatureStatusCard } from '../components/FeatureStatus'
import { KitchenVoiceCard } from '../components/KitchenVoiceCard'

/**
 * AI and voice of the account (ADR 0014). Activation is decided by the
 * organization (and the platform above it); here the account sees what is
 * active and tunes what it is allowed to: AI thresholds (ai.manage) and the
 * kitchen voice (settings.manage), when the organization permits it.
 */
export function FeaturesSettingsPage() {
  const { can, organizationRole, feature } = useActiveKitchen()
  const commands = feature('voice_commands')
  return (
    <div className="space-y-8">
      <p className={typography.small}>
        Aquí ves qué funciones de IA y voz están activas en esta cuenta y ajustas lo que tu organización permite.
        {organizationRole === 'SUPER_ADMIN'
          ? ' Qué se activa en cada cuenta lo decides en Administración de la organización → IA.'
          : ' Qué se activa en cada cuenta lo decide el SUPER_ADMIN de la organización.'}
      </p>

      {can('settings.manage') && (
        <section className="space-y-3">
          <h2 className={clsx('flex items-center gap-2', typography.overline)}>
            <Mic size={13} aria-hidden /> Voz
          </h2>
          <KitchenVoiceCard />
          {commands && <FeatureStatusCard state={commands} />}
        </section>
      )}

      {can('ai.manage') && (
        <section className="space-y-3">
          <h2 className={clsx('flex items-center gap-2', typography.overline)}>
            <Sparkles size={13} aria-hidden /> Inteligencia artificial
          </h2>
          <AiSettingsPage />
        </section>
      )}
    </div>
  )
}
