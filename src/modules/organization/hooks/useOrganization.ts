import { useQuery } from '@tanstack/react-query'
import { getOrganization, listOrgAccounts, listOrgRoles, listOrgUsers, listPermissionCatalog } from '../api/organization'

// Todas cuelgan de 'org' + id: invalidar ['org', id] refresca usuarios, roles y Cuentas juntos.
export const orgKey = (organizationId: string) => ['org', organizationId] as const

export function useOrgUsers(organizationId: string) {
  return useQuery({ queryKey: [...orgKey(organizationId), 'users'], queryFn: () => listOrgUsers(organizationId) })
}

export function useOrgRoles(organizationId: string) {
  return useQuery({ queryKey: [...orgKey(organizationId), 'roles'], queryFn: () => listOrgRoles(organizationId) })
}

export function useOrgAccounts(organizationId: string) {
  return useQuery({ queryKey: [...orgKey(organizationId), 'accounts'], queryFn: () => listOrgAccounts(organizationId) })
}

export function useOrganizationDetails(organizationId: string) {
  return useQuery({ queryKey: [...orgKey(organizationId), 'details'], queryFn: () => getOrganization(organizationId) })
}

export function usePermissionCatalog() {
  return useQuery({ queryKey: ['permission-catalog'], queryFn: listPermissionCatalog, staleTime: 10 * 60_000 })
}
