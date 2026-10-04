import { useQuery } from '@tanstack/react-query'
import { fetchRoleUsage, getOrganization, listAccountUsers, listOrgAccounts, listOrgRoles, listOrgUsers, listPermissionCatalog } from '../api/organization'

// Todas cuelgan de 'org' + id: invalidar ['org', id] refresca usuarios, roles y Cuentas juntos.
export const orgKey = (organizationId: string) => ['org', organizationId] as const

export function useOrgUsers(organizationId: string) {
  return useQuery({ queryKey: [...orgKey(organizationId), 'users'], queryFn: () => listOrgUsers(organizationId) })
}

/** Members of the active account (ADR 0024). Under orgKey so every team change refreshes it. */
export function useAccountUsers(organizationId: string, accountId: string) {
  return useQuery({ queryKey: [...orgKey(organizationId), 'account-users', accountId], queryFn: listAccountUsers })
}

export function useRoleUsage(organizationId: string, accountId: string) {
  return useQuery({ queryKey: [...orgKey(organizationId), 'role-usage', accountId], queryFn: fetchRoleUsage })
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
