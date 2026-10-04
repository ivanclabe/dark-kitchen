import { CommandRecognitionPanel } from '@/modules/kitchen/voice/CommandRecognitionPanel'
import { WakeWordPanel } from '@/modules/kitchen/voice/WakeWordPanel'
import { FeaturesPanel } from '@/modules/organization/components/FeaturesPanel'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { StatCard } from '@/shared/ui/StatCard'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { typography } from '@/shared/ui/typography'
import { toVoiceSettings } from '@/shared/voice/catalog'
import { DeviceVoicePanel } from '@/shared/voice/DeviceVoicePanel'
import { wakeWordTuning } from '@/shared/voice/wakeWord/tuning'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Activity, AlertTriangle, BarChart3, Gauge, Mic, Sparkles, Tablet, Volume2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { fetchAccountAiUsage } from '../api'
import { AiStatusPanel } from '../components/AiStatusPanel'
import { FeatureStatusCard } from '../components/FeatureStatus'
import { KitchenVoicePanel } from '../components/KitchenVoicePanel'

type Tab = 'features' | 'voice' | 'device' | 'usage' | 'status'

/** What depends on each tablet (ADR 0018): the voice it speaks with, the recognizer and hands-free. */
function ThisDevicePanel({ showStatus }: { showStatus: boolean }) {
  const { feature, features } = useActiveKitchen()
  const speech = feature('voice_speech')
  const commands = feature('voice_commands')
  const wakeWord = feature('voice_wake_word')

  return (
    <div className="space-y-8">
      <p className={typography.small}>
        Lo que depende de <span className="text-neutral-200">este equipo</span> (cada tablet o computador): con qué voz habla, qué reconocedor usa y si escucha
        manos libres.
      </p>
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
      {!speech?.usable && !commands?.usable && <p className={typography.caption}>La voz no está activa en esta cuenta: no hay nada que ajustar en este equipo.</p>}
      {showStatus && (
        <section className="space-y-3">
          <h2 className={typography.overline}>Funciones de IA y voz en esta cuenta</h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {features.map((state) => (
              <FeatureStatusCard key={state.key} state={state} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function UsagePanel() {
  const { kitchen } = useActiveKitchen()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['account', kitchen.id, 'ai-usage'],
    queryFn: () => fetchAccountAiUsage(),
    refetchInterval: 60_000,
  })
  if (isLoading) return <LoadingState variant="cards" rows={1} cols={3} />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />
  const pct = Math.min(100, Math.round((data.totals.runs24h / Math.max(data.dailyLimit, 1)) * 100))

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Análisis de IA (30 días)" value={data.totals.runs} icon={BarChart3} tone="brand" />
        <StatCard label="Últimas 24 horas" value={data.totals.runs24h} hint={`Tope: ${data.dailyLimit} al día (${pct}%)`} icon={Activity} tone={pct >= 80 ? 'warn' : 'neutral'} />
        <StatCard label="Con error" value={data.totals.errors} icon={AlertTriangle} tone={data.totals.errors > 0 ? 'warn' : 'neutral'} />
      </div>
      {data.byFeature.length > 0 ? (
        <section className="space-y-2">
          <h2 className={typography.h3}>Por función</h2>
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 px-4">
            {data.byFeature.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-neutral-200">{f.label ?? f.key}</span>
                <span className="tabular-nums text-neutral-400">
                  {f.runs} {f.errors > 0 && <span className="text-red-300">· {f.errors} con error</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className={typography.caption}>Todavía no hay análisis de IA en esta cuenta.</p>
      )}
      <p className={typography.caption}>La voz de cocina usa la voz de cada equipo: no genera llamadas ni costo, por eso no aparece aquí. Los costos los ve la plataforma.</p>
    </div>
  )
}

/**
 * IA y voz of the active account (ADR 0014, ADR 0018, ADR 0024, D3): which
 * features this account uses and how they behave, the kitchen voice, this
 * device, usage and status. General values say "Aplica a todas tus cuentas".
 * Without features.manage only this device and the read-only status remain.
 */
export function AiSettingsPage() {
  const { organization, kitchen, can, canShared } = useActiveKitchen()
  const [params, setParams] = useSearchParams()
  const manage = canShared('features.manage') && organization !== null
  const seeUsage = manage || canShared('observability.view')
  const tabs: TabItem<Tab>[] = [
    ...(manage ? [{ value: 'features' as const, label: 'Funciones', icon: Sparkles }] : []),
    ...(manage ? [{ value: 'voice' as const, label: 'Voz de cocina', icon: Volume2 }] : []),
    ...(can('settings.manage') || can('ai.manage') ? [{ value: 'device' as const, label: 'En este equipo', icon: Tablet }] : []),
    ...(seeUsage ? [{ value: 'usage' as const, label: 'Uso', icon: BarChart3 }] : []),
    ...(manage ? [{ value: 'status' as const, label: 'Estado', icon: Gauge }] : []),
  ]
  const requested = params.get('tab') as Tab | null
  const tab: Tab = tabs.find((t) => t.value === requested)?.value ?? tabs[0]?.value ?? 'device'

  return (
    <div className="space-y-6">
      {tabs.length > 1 && <Tabs value={tab} onChange={(t) => setParams(t === tabs[0].value ? {} : { tab: t }, { replace: true })} items={tabs} />}
      {tab === 'features' && organization ? (
        <FeaturesPanel organizationId={organization.id} accountId={kitchen.id} />
      ) : tab === 'voice' && organization ? (
        <KitchenVoicePanel organizationId={organization.id} />
      ) : tab === 'usage' ? (
        <UsagePanel />
      ) : tab === 'status' ? (
        <AiStatusPanel />
      ) : (
        <ThisDevicePanel showStatus={!manage} />
      )}
    </div>
  )
}
