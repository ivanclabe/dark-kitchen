import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { CheckCircle2, ChefHat, KeyRound, ShieldCheck, Warehouse } from 'lucide-react'
import { FeatureCard } from '../components/FeatureCard'
import { useAiConnectionStatus } from '../hooks/useAi'
import { AI_FEATURES } from '../lib/catalog'

function ConnectionCard() {
  const { data, isLoading, isError } = useAiConnectionStatus()
  const configured = data?.configured === true
  return (
    <div className={clsx('flex items-start gap-3 rounded-2xl border p-4', configured ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
      {configured ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> : <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-400" />}
      <div className="min-w-0 text-sm">
        <p className="font-medium text-neutral-100">{isLoading ? 'Verificando conexión…' : configured ? 'IA conectada' : isError ? 'No se pudo verificar la conexión' : 'IA no conectada'}</p>
        <p className={clsx('mt-0.5', typography.caption)}>
          {configured
            ? 'Las funciones con IA usan el modelo que define la plataforma.'
            : 'La administración de la plataforma todavía no conectó la IA. Mientras tanto, las alertas y listas calculadas por el sistema funcionan igual; solo faltan las explicaciones de la IA.'}
        </p>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, area }: { title: string; icon: typeof Warehouse; area: 'supply' | 'kitchen' }) {
  return (
    <section className="space-y-3">
      <h2 className={clsx('flex items-center gap-2', typography.overline)}>
        <Icon size={13} aria-hidden /> {title}
      </h2>
      <div className="grid gap-4 xl:grid-cols-2">
        {AI_FEATURES.filter((f) => f.area === area).map((definition) => (
          <FeatureCard key={definition.key} definition={definition} />
        ))}
      </div>
    </section>
  )
}

/**
 * AI of the account (ADR 0014): each feature shows whether it is active here
 * (the organization activates it) and its thresholds, stored in the account
 * within the platform ranges. The AI recommends and explains; it never buys
 * or changes orders.
 */
export function AiSettingsPage() {
  return (
    <div className="space-y-6">
      <p className={typography.small}>Ajusta los umbrales de las funciones activas en esta cuenta. Todo se calcula con los datos reales de la operación.</p>

      <div className="grid gap-3 lg:grid-cols-2">
        <ConnectionCard />
        <div className="flex items-start gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-neutral-400" />
          <div className="text-sm">
            <p className="font-medium text-neutral-100">La IA recomienda, tú decides</p>
            <p className={clsx('mt-0.5', typography.caption)}>
              Las cifras las calcula el sistema; la IA solo prioriza y explica. No crea compras ni cambia pedidos: cada acción es un botón que alguien pulsa.
            </p>
          </div>
        </div>
      </div>

      <Section title="Abastecimiento e inventario" icon={Warehouse} area="supply" />
      <Section title="Cocina" icon={ChefHat} area="kitchen" />
    </div>
  )
}
