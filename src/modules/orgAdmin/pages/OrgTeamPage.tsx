import { useOrgAccounts } from '@/modules/organization/hooks/useOrganization'
import { TeamView } from '@/modules/organization/pages/UsersAndPermissionsPage'
import { useOrgAdmin } from '@/shared/org/orgContext'
import { LoadingState } from '@/shared/ui/LoadingState'

/** Equipos (ADR 0012, sección 6): todas las personas de la organización, sus roles y Cuentas. */
export function OrgTeamPage() {
  const { organization, can } = useOrgAdmin()
  const accounts = useOrgAccounts(organization.id)
  if (accounts.isLoading || !accounts.data) return <LoadingState variant="block" />
  return (
    <TeamView
      organizationId={organization.id}
      scopeName={organization.name}
      manageOrg={can('users.manage')}
      manageTeam={can('users.manage')}
      canManageRoles={can('roles.manage')}
      // En la organización, quien administra usuarios tiene todos los permisos de organización:
      // el tope de "no dar lo que no tienes" lo sigue aplicando la base en cada Cuenta.
      myPermissions={new Set<string>()}
      assignable={accounts.data}
      showActivity
    />
  )
}
