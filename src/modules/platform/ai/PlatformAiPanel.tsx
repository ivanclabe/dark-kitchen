import { FEATURE_CATEGORY_LABEL, type FeatureKey } from '@/shared/features/features'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Switch } from '@/shared/ui/Switch'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, BarChart3, Mic, Plug, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchPlatformAiOverview, PLATFORM_AI_KEY, setPlatformFeature, type PlatformFeature } from './api'
import { FeatureDrawer } from './FeatureDrawer'
import { PoliciesTab } from './PoliciesTab'
import { ProvidersTab } from './ProvidersTab'
import { UsageTab } from './UsageTab'
import { VoiceCatalogTab } from './VoiceCatalogTab'

type AiTab = 'features' | 'providers' | 'voice' | 'usage' | 'policies'

const TABS: TabItem<AiTab>[] = [
  { value: 'features', label: 'Funciones', icon: Sparkles },
  { value: 'providers', label: 'Proveedores', icon: Plug },
  { value: 'voice', label: 'Voz', icon: Mic },
  { value: 'usage', label: 'Uso', icon: BarChart3 },
  { value: 'policies', label: 'Políticas', icon: ShieldCheck },
]

/**
 * Platform → AI (ADR 0014): the central control of AI and voice. Features
 * (global switch, where they are used, errors), providers and models, voice
 * catalog, usage and limits. Each change is checked by the database and
 * logged in the audit trail.
 */
export function PlatformAiPanel() {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [params, setParams] = useSearchParams()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: PLATFORM_AI_KEY, queryFn: fetchPlatformAiOverview })
  const [openKey, setOpenKey] = useState<FeatureKey | null>(null)
  const requested = params.get('ai') as AiTab | null
  const tab: AiTab = TABS.some((t) => t.value === requested) ? (requested as AiTab) : 'features'

  const toggle = useMutation({
    mutationFn: ({ key, active }: { key: FeatureKey; active: boolean }) => setPlatformFeature(key, { active }),
    onSuccess: async (_, { active }) => {
      await queryClient.invalidateQueries({ queryKey: PLATFORM_AI_KEY })
      show(active ? 'Función encendida en la plataforma.' : 'Función apagada en toda la plataforma.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar'), 'error'),
  })

  const setTab = (t: AiTab) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (t === 'features') next.delete('ai')
        else next.set('ai', t)
        return next
      },
      { replace: true },
    )

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />

  const labelOf = (key: string) => data.features.find((f) => f.key === key)?.label ?? key
  const open = data.features.find((f) => f.key === openKey) ?? null

  const columns: DataTableColumn<PlatformFeature>[] = [
    {
      key: 'label',
      header: 'Función',
      cell: (f) => (
        <button type="button" onClick={() => setOpenKey(f.key)} className="min-w-0 text-left hover:text-brasa-300">
          <span className="flex flex-wrap items-center gap-2 font-medium text-neutral-100">
            {f.label}
            {f.category === 'ai' &&
              (f.usesModel ? (
                <Badge tone="brand" size="sm" icon={Sparkles}>
                  IA
                </Badge>
              ) : (
                <Badge tone="neutral" size="sm" icon={Workflow}>
                  Regla
                </Badge>
              ))}
          </span>
          <span className="block text-xs text-neutral-500">{FEATURE_CATEGORY_LABEL[f.category]}</span>
        </button>
      ),
    },
    {
      key: 'active',
      header: 'Estado',
      cell: (f) => (
        <span className="flex items-center gap-2">
          <Switch checked={f.active} onChange={(active) => toggle.mutate({ key: f.key, active })} label={`${f.label} en la plataforma`} disabled={toggle.isPending} />
          <span className={clsx('text-xs', f.active ? 'text-emerald-300' : 'text-neutral-500')}>{f.active ? 'Encendida' : 'Apagada'}</span>
        </span>
      ),
    },
    { key: 'plans', header: 'Planes', hideBelow: 'lg', cell: (f) => <span className="text-xs text-neutral-400">{f.plans.join(', ') || '—'}</span> },
    {
      key: 'accounts',
      header: 'Cuentas activas',
      align: 'right',
      cell: (f) => (
        <span className="inline-flex flex-col items-end whitespace-nowrap tabular-nums">
          <span className="text-neutral-100">
            {f.accountsEnabled} <span className="text-neutral-500">de {f.accountsTotal}</span>
          </span>
          <span className="text-xs text-neutral-500">
            {f.organizationsOffering} de {f.organizationsTotal} organizaciones
          </span>
        </span>
      ),
    },
    {
      key: 'health',
      header: 'Salud',
      hideBelow: 'md',
      cell: (f) =>
        f.issues.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-amber-300">
            <AlertTriangle size={12} aria-hidden /> {f.issues[0]}
          </span>
        ) : f.errors24h > 0 ? (
          <span className="text-xs text-red-300">{f.errors24h} errores en 24 h</span>
        ) : (
          <span className="text-xs text-neutral-500">Sin problemas</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      cell: (f) => (
        <Button variant="link" size="sm" onClick={() => setOpenKey(f.key)}>
          Gestionar
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <Tabs value={tab} onChange={setTab} items={TABS} />
      {tab === 'features' && (
        <div className="space-y-3">
          <p className={typography.small}>
            Una función se usa en una cuenta solo si está encendida aquí, su plan la incluye, su organización la ofrece y la activó en esa cuenta. Apagarla aquí la apaga en todas, sin borrar su configuración.
          </p>
          <DataTable columns={columns} rows={data.features} getRowId={(f) => f.key} />
        </div>
      )}
      {tab === 'providers' && <ProvidersTab models={data.models} labelOf={labelOf} />}
      {tab === 'voice' && <VoiceCatalogTab voiceFeature={data.features.find((f) => f.key === 'voice_speech')} />}
      {tab === 'usage' && <UsageTab />}
      {tab === 'policies' && <PoliciesTab overview={data} />}
      {open && <FeatureDrawer key={open.key} feature={open} models={data.models} labelOf={labelOf} onClose={() => setOpenKey(null)} />}
    </div>
  )
}
