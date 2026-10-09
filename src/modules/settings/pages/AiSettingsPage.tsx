import { VoiceDeviceSettings } from '@/modules/voice/components/VoiceDeviceSettings'
import { FeaturesPanel } from '@/modules/organization/components/FeaturesPanel'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { KpiStrip } from '@/shared/ui/KpiStrip'
import { typography } from '@/shared/ui/typography'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { fetchAccountAiUsage, type AccountAiUsage } from '../api'
import { AiStatusPanel } from '../components/AiStatusPanel'
import { FeatureStatusCard } from '../components/FeatureStatus'
import { SettingsPage } from '../ui/SettingsPage'
import { Section } from '@/shared/ui/Section'
import { SubNav, type SubNavItem } from '@/shared/ui/SubNav'

type Tab = 'features' | 'device' | 'usage'

/** Old tabs (ADR 0024) → where they live now (ADR 0026). */
const OLD_TABS: Record<string, Tab> = { voice: 'features', status: 'usage' }

/** «Oye Quanela» on this device (ADR 0018, ADR 0033): how it listens and speaks here. */
function ThisDevice({ showStatus }: { showStatus: boolean }) {
  const { features } = useActiveKitchen()

  return (
    <>
      <VoiceDeviceSettings />
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

const SCOPE_LABEL: Record<string, string> = {
  answered: 'Respondidas',
  partial: 'Parciales',
  no_data: 'Sin datos',
  not_allowed: 'Sin permiso',
  unsupported: 'Dato que Quanela no guarda',
  out_of_scope: 'Fuera del negocio',
  action: 'Pedían una acción',
  clarify: 'Pidieron precisar',
}

const seconds = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`)

/** ADR 0033, phase 4: precision (scopes and 👍/👎) and response time of Copilot, aggregated. */
function CopilotQuality({ copilot }: { copilot: NonNullable<AccountAiUsage['copilot']> }) {
  const rated = copilot.thumbsUp + copilot.thumbsDown
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-neutral-200">Copilot</h3>
      <KpiStrip
        columns={3}
        items={[
          { id: 'questions', label: 'Preguntas', value: String(copilot.questions), change: null, goodWhen: 'neutral', hint: `${copilot.byVoice} por voz · tope ${copilot.dailyLimit} al día` },
          { id: 'time', label: 'Tiempo de respuesta (mediana)', value: seconds(copilot.p50Ms), change: null, goodWhen: 'neutral', hint: `9 de cada 10 en ${seconds(copilot.p90Ms)} o menos` },
          {
            id: 'useful',
            label: 'Útiles',
            value: rated > 0 ? `${Math.round((copilot.thumbsUp / rated) * 100)} %` : '—',
            change: null,
            goodWhen: 'neutral',
            hint: rated > 0 ? `${copilot.thumbsUp} 👍 · ${copilot.thumbsDown} 👎` : 'Nadie ha calificado todavía',
          },
        ]}
      />
      {Object.keys(copilot.byScope).length > 0 && (
        <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 px-4">
          {Object.entries(copilot.byScope)
            .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
            .map(([scope, n]) => (
              <li key={scope} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-neutral-200">{SCOPE_LABEL[scope] ?? scope}</span>
                <span className="tabular-nums text-neutral-400">{n}</span>
              </li>
            ))}
        </ul>
      )}
      {(copilot.errors > 0 || copilot.cancelled > 0) && (
        <p className={typography.caption}>
          {copilot.errors} con error · {copilot.cancelled} canceladas
        </p>
      )}
    </div>
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
            {data.copilot && data.copilot.questions > 0 && <CopilotQuality copilot={data.copilot} />}
            <p className={typography.caption}>«Oye Quanela» usa la voz de cada equipo: hablar no genera llamadas ni costo; cada pregunta a Copilot cuenta como una consulta de IA.</p>
          </div>
        )}
      </Section>
    </>
  )
}

/**
 * IA y voz of the active account (ADR 0014, ADR 0018, ADR 0024, ADR 0026):
 *   Funciones       — what this account uses and how it behaves. ADR 0045: «Voz de la
 *                     aplicación» is not here — always on, with the platform's voice.
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
    ...(can('settings.manage') || can('ai.manage') || can('voice.use') ? [{ value: 'device' as const, label: 'Este dispositivo' }] : []),
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
        <FeaturesPanel organizationId={organization.id} accountId={kitchen.id} />
      ) : tab === 'usage' ? (
        <UsageAndState />
      ) : (
        <ThisDevice showStatus={!manage} />
      )}
    </SettingsPage>
  )
}
