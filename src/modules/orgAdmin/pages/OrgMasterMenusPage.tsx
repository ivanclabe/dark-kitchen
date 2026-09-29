import { useOrgAccounts } from '@/modules/organization/hooks/useOrganization'
import { MasterMenusPanel } from '@/modules/platform/components/MasterMenusPanel'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Layers } from 'lucide-react'

/** Menús maestros (nivel organización): platos con receta compartidos entre Cuentas. */
export function OrgMasterMenusPage() {
  const { organization } = useOrgAdmin()
  const { data: accounts, isLoading } = useOrgAccounts(organization.id)
  return (
    <div className="space-y-6">
      <PageHeader title="Menús maestros" icon={Layers} description="Platos con receta que mantienes en un solo lugar y compartes con tus cuentas." />
      {isLoading || !accounts ? <LoadingState variant="block" /> : <MasterMenusPanel organizationId={organization.id} kitchens={accounts.filter((a) => a.active)} />}
    </div>
  )
}
