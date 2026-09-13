import type { Role } from '@/shared/rbac/roles'

export interface StaffUser {
  id: string
  fullName: string
  role: Role
  active: boolean
  createdAt: string
}
