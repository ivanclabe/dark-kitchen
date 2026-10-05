import { CommandRecognitionPanel } from '@/modules/kitchen/voice/CommandRecognitionPanel'
import { WakeWordPanel } from '@/modules/kitchen/voice/WakeWordPanel'
import { FeaturesPanel } from '@/modules/organization/components/FeaturesPanel'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Accordion } from '@/shared/ui/Accordion'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { KpiStrip } from '@/shared/ui/KpiStrip'
import { typography } from '@/shared/ui/typography'
import { toVoiceSettings } from '@/shared/voice/catalog'
import { DeviceVoicePanel } from '@/shared/voice/DeviceVoicePanel'
import { wakeWordTuning } from '@/shared/voice/wakeWord/tuning'
import { useQuery } from '@tanstack/react-query'
import { Volume2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { fetchAccountAiUsage } from '../api'
import { AiStatusPanel } from '../components/AiStatusPanel'
import { FeatureStatusCard } from '../components/FeatureStatus'
import { KitchenVoicePanel } from '../components/KitchenVoicePanel'
import { SettingsPage } from '../ui/SettingsPage'
import { Section } from '@/shared/ui/Section'
import { SubNav, type SubNavItem } from '@/shared/ui/SubNav'

type Tab = 'features' | 'device' | 'usage'

/** Old tabs (ADR 0024) → where they live now (ADR 0026). */
const OLD_TABS: Record<string, Tab> = { voice: 'features', status: 'usage' }

/** What depends on each tablet (ADR 0018): the voice it speaks with, the recognizer and hands-free. */
function ThisDevice({ showStatus }: { showStatus: boolean }) {
  const { feature, features } = useActiveKitchen()
  const speech = feature('voice_speech')
  const commands = feature('voice_commands')
  const wakeWord = feature('voice_wake_word')

  return (
    <>
      {speech?.usable && (
        <Section title="Voz de cocina" description="Con qué voz habla este equipo." card>
          <DeviceVoicePanel lang={toVoiceSettings(speech.settings).lang} />
        </Section>
      )}
      {commands?.usable && (
        <Section title="Comandos de voz" description="Qué reconocedor usa este equipo y si escucha manos libres." card>
          <CommandRecognitionPanel />
          {wakeWord?.usable && (
            <div className="mt-5 border-t border-neutral-800/60 pt-5">
              <WakeWordPanel tuning={wakeWordTuning(wakeWord)} />
            </div>
          )}
        </Section>
      )}
      {!speech?.usable && !commands?.usable && <p className={typography.small}>La voz no está activa en esta cuenta: no hay nada que ajustar en este equipo.</p>}
      {showStatus && (
        <Section title="Funciones de IA y voz en esta cuenta" description="Las activa quien administra las funciones.">
          <div className="space-y-3">
            {features.map((state) => (
              <FeatureStatusCard key={state.key} state={state} />
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

/** Usage and state of AI in this account (ADR 0026: «Uso» and «Estado» together). */
function UsageAndState() {
  const { kitchen } = useActiveKitchen()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['account', kitchen.id, 'ai-usage'],
    queryFn: () => fetchAccountAiUsage(),
    refetchInterval: 60_000,
  })

  return (
    <>
      <Section title="Estado">
        <AiStatusPanel />
      </Section>
      <Section title="Uso" description="Análisis de IA de esta cuenta en los últimos 30 días.">
        {isLoading ? (
          <LoadingState variant="block" />
        ) : isError || !data ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-4">
            <KpiStrip
              columns={3}
              items={[
                { id: 'runs', label: 'Análisis (30 días)', value: String(data.totals.runs), change: null, goodWhen: 'neutral' },
                { id: 'day', label: 'Últimas 24 horas', value: String(data.totals.runs24h), change: null, goodWhen: 'neutral', hint: `Tope del plan: ${data.dailyLimit} al día` },
                { id: 'errors', label: 'Con error', value: String(data.totals.errors), change: null, goodWhen: 'neutral' },
              ]}
            />
            {data.byFeature.length > 0 ? (
              <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 px-4">
                {data.byFeature.map((f) => (
                  <li key={f.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="text-neutral-200">{f.label ?? f.key}</span>
                    <span className="tabular-nums text-neutral-400">
                      {f.runs} {f.errors > 0 && <span className="text-red-300">· {f.errors} con error</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={typography.caption}>Todavía no hay análisis de IA en esta cuenta.</p>
            )}
            <p className={typography.caption}>La voz de cocina usa la voz de cada equipo: no genera llamadas ni costo, por eso no aparece aquí.</p>
          </div>
        )}
      </Section>
    </>
  )
}

/**
 * IA y voz of the active account (ADR 0014, ADR 0018, ADR 0024, ADR 0026):
 *   Funciones       — what this account uses and how it behaves (the kitchen voice included)
 *   Este dispositivo — the voice and microphone of this tablet
 *   Uso y estado    — connection, usage and the daily limit
 * Without features.manage only "Este dispositivo" remains, without sub-navigation.
 */
export function AiSettingsPage() {
  const { organization, kitchen, can, canShared } = useActiveKitchen()
  const [params, setParams] = useSearchParams()
  const manage = canShared('features.manage') && organization !== null
  const tabs: SubNavItem<Tab>[] = [
    ...(manage ? [{ value: 'features' as const, label: 'Funciones' }] : []),
    ...(can('settings.manage') || can('ai.manage') ? [{ value: 'device' as const, label: 'Este dispositivo' }] : []),
    ...(manage || canShared('observability.view') ? [{ value: 'usage' as const, label: 'Uso y estado' }] : []),
  ]
  const raw = params.get('tab') ?? ''
  const requested = OLD_TABS[raw] ?? raw
  const tab: Tab = tabs.find((t) => t.value === requested)?.value ?? tabs[0]?.value ?? 'device'

  return (
    <SettingsPage
      title="IA y voz"
      description="Funciones de IA y voz de esta cuenta y cómo se comportan."
      subNav={tabs.length > 1 ? <SubNav label="Secciones de IA y voz" items={tabs} value={tab} onChange={(t) => setParams(t === tabs[0].value ? {} : { tab: t }, { replace: true })} /> : undefined}
    >
      {tab === 'features' && organization ? (
        <FeaturesPanel
          organizationId={organization.id}
          accountId={kitchen.id}
          extra={(key) =>
            key === 'voice_speech' ? (
              <Accordion
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <Volume2 size={13} className="text-neutral-500" aria-hidden /> Voz de cocina
                  </span>
                }
              >
                <KitchenVoicePanel organizationId={organization.id} />
              </Accordion>
            ) : null
          }
        />
      ) : tab === 'usage' ? (
        <UsageAndState />
      ) : (
        <ThisDevice showStatus={!manage} />
      )}
    </SettingsPage>
  )
}
