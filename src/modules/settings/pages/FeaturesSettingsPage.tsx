import { AiSettingsPage } from '@/modules/ai/pages/AiSettingsPage'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { Mic, Sparkles } from 'lucide-react'
import { FeatureSwitchCard } from '../components/FeatureSwitchCard'

/**
 * Funciones de la Cuenta (ADR 0009): IA y voz. La organización decide qué
 * ofrece; aquí se activa lo ofrecido. Cada sección según el permiso que la
 * administra (ai.manage para la IA, settings.manage para la voz).
 */
export function FeaturesSettingsPage() {
  const { can, organizationRole } = useActiveKitchen()
  return (
    <div className="space-y-8">
      <p className={typography.small}>
        Activa las funciones que tu organización ofrece para esta cuenta.
        {organizationRole === 'SUPER_ADMIN'
          ? ' Qué se ofrece a cada cuenta lo decides en Configuración de la organización → Funciones.'
          : ' Qué funciones se ofrecen lo decide el SUPER_ADMIN de la organización.'}
      </p>

      {can('settings.manage') && (
        <section className="space-y-3">
          <h2 className={clsx('flex items-center gap-2', typography.overline)}>
            <Mic size={13} aria-hidden /> Voz
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            <FeatureSwitchCard featureKey="voice_commands" />
            <FeatureSwitchCard featureKey="voice_speech" />
          </div>
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
