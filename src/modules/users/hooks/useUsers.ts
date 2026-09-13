import type { Role } from '@/shared/rbac/roles'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listUsers, setUserActive, updateUserRole } from '../api/users'

const USERS_KEY = ['staff-users'] as const

export function useUsers() {
  return useQuery({ queryKey: USERS_KEY, queryFn: listUsers })
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => updateUserRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useSetUserActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setUserActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
