import { FeaturesPanel } from '@/modules/organization/components/FeaturesPanel'
import { OrgGeneralForm } from '@/modules/organization/components/OrgGeneralForm'
import { useOrgAccounts, useOrganizationDetails } from '@/modules/organization/hooks/useOrganization'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { ActiveBadge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { Building2, Copy, Plug, Settings, Sparkles } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { OrgAccount } from '@/modules/organization/api/organization'

type Tab = 'general' | 'funciones' | 'integraciones'

/**
 * Integraciones (ADR 0012): cada integración apunta a una Cuenta con su ID
 * (encabezado x-dk-kitchen-id). Aquí se ven todas juntas; la actividad por
 * canal (p. ej. pedidos por WhatsApp) está en Observabilidad.
 */
function IntegrationsPanel({ organizationId }: { organizationId: string }) {
  const { path } = useOrgAdmin()
  const { show } = useToast()
  const { data: accounts, isLoading, isError, error, refetch } = useOrgAccounts(organizationId)
  const columns: DataTableColumn<OrgAccount>[] = [
    {
      key: 'name',
      header: 'Cuenta',
      cell: (a) => (
        <span className="flex min-w-0 items-center gap-2">
          <AccountIcon iconKey={a.iconKey} seed={a.id} size="xs" /> <span className="truncate font-medium text-neutral-100">{a.name}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Estado', hideBelow: 'md', cell: (a) => <ActiveBadge active={a.active} /> },
    { key: 'id', header: 'ID de la cuenta', cell: (a) => <code className="text-xs break-all text-neutral-300">{a.id}</code> },
    {
      key: 'actions',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      cell: (a) => (
        <span className="flex justify-end gap-3">
          <Button
            variant="link"
            size="sm"
            icon={Copy}
            onClick={() =>
              navigator.clipboard.writeText(a.id).then(
                () => show(`ID de ${a.name} copiado.`),
                () => show('No se pudo copiar; selecciónalo y cópialo a mano.', 'error'),
              )
            }
          >
            Copiar
          </Button>
          <Link to={path(`/observabilidad?cuenta=${a.id}`)} className="hidden text-sm text-neutral-400 hover:text-neutral-100 sm:inline">
            Actividad
          </Link>
        </span>
      ),
    },
  ]
  return (
    <div className="space-y-4">
      <p className={typography.small}>
        Para conectar un sistema externo (por ejemplo, pedidos por WhatsApp con n8n) a una cuenta, la integración envía su ID en el encabezado{' '}
        <code className="text-neutral-300">x-dk-kitchen-id</code>. Sin él no ve ni registra nada.
      </p>
      <DataTable columns={columns} rows={accounts} getRowId={(a) => a.id} isLoading={isLoading} error={isError ? error : undefined} onRetry={() => void refetch()} />
      <p className={typography.caption}>Las fallas de las integraciones todavía no se registran; la actividad por canal sí (Observabilidad).</p>
    </div>
  )
}

/**
 * Configuración de la organización (ADR 0012, sección 3): lo que afecta a
 * todas las Cuentas. Lo propio de cada Cuenta (horario, alertas de tiempo,
 * parámetros de IA, domiciliarios) sigue en esa Cuenta.
 */
export function OrgSettingsPage() {
  const { organization, can } = useOrgAdmin()
  const [params, setParams] = useSearchParams()
  const details = useOrganizationDetails(organization.id)

  const tabs: TabItem<Tab>[] = [
    ...(can('organization.manage') ? [{ value: 'general' as const, label: 'General', icon: Building2 }] : []),
    ...(can('features.manage') ? [{ value: 'funciones' as const, label: 'Funciones (IA y voz)', icon: Sparkles }] : []),
    ...(can('organization.manage') ? [{ value: 'integraciones' as const, label: 'Integraciones', icon: Plug }] : []),
  ]
  const requested = params.get('tab') as Tab | null
  const tab: Tab = tabs.find((t) => t.value === requested)?.value ?? tabs[0]?.value ?? 'general'

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" icon={Settings} description="Lo que aplica a todas las cuentas de la organización." />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={tabs} />
      {tab === 'general' ? (
        details.isLoading ? (
          <LoadingState variant="block" />
        ) : details.isError || !details.data ? (
          <ErrorState error={details.error} onRetry={() => void details.refetch()} />
        ) : (
          <OrgGeneralForm key={details.data.id} org={details.data} />
        )
      ) : tab === 'funciones' ? (
        <FeaturesPanel organizationId={organization.id} />
      ) : (
        <IntegrationsPanel organizationId={organization.id} />
      )}
    </div>
  )
}
