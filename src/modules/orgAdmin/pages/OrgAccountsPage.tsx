import { OrgAccountsPanel } from '@/modules/organization/components/OrgAccountsPanel'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Store } from 'lucide-react'

/**
 * Todas mis cuentas (ADR 0012, sección 4): administrar las Cuentas de la
 * organización. Operar una Cuenta es otro contexto: "Entrar".
 */
export function OrgAccountsPage() {
  const { organization, can, path } = useOrgAdmin()
  return (
    <div className="space-y-6">
      <PageHeader title="Cuentas" icon={Store} description={`Los establecimientos de ${organization.name}.`} />
      <OrgAccountsPanel
        organizationId={organization.id}
        organizationName={organization.name}
        canCreate={can('accounts.create')}
        canManage={can('accounts.manage')}
        canBilling={can('billing.view')}
        observabilityPath={can('observability.view') ? (id) => path(`/observabilidad?cuenta=${id}`) : undefined}
      />
    </div>
  )
}
