import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCustomerPreference,
  archiveCustomerAddress,
  createCustomerComplaint,
  createCustomerRecommendation,
  fetchCustomerOrderStats,
  fetchCustomerProfile,
  fetchPreferenceOptions,
  removeCustomerPreference,
  saveCustomerAddress,
  setRecommendationStatus,
  updateCustomerComplaint,
  updateCustomerNotes,
} from '../api/profile'

const profileKey = (id: string) => ['customers', 'profile', id] as const

/** The sections of the 360° sheet (ADR 0040). */
export function useCustomerProfile(id: string) {
  return useQuery({ queryKey: profileKey(id), queryFn: () => fetchCustomerProfile(id), enabled: !!id })
}

export function useCustomerOrderStats(id: string) {
  const { can } = useActiveKitchen()
  return useQuery({ queryKey: ['customers', 'order-stats', id], queryFn: () => fetchCustomerOrderStats(id), enabled: !!id && can('orders.view') })
}

export function usePreferenceOptions(enabled = true) {
  return useQuery({ queryKey: ['customers', 'preference-options'], queryFn: fetchPreferenceOptions, enabled, staleTime: 5 * 60_000 })
}

/** Every write of the sheet refreshes the sheet, and the customer (the last address, the note). */
function useProfileMutation<T>(customerId: string, fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: profileKey(customerId) }),
        client.invalidateQueries({ queryKey: ['customers', 'detail', customerId] }),
        client.invalidateQueries({ queryKey: ['customers', 'page'] }),
      ]),
  })
}

export function useSaveAddress(customerId: string) {
  return useProfileMutation(customerId, saveCustomerAddress)
}
export function useArchiveAddress(customerId: string) {
  return useProfileMutation(customerId, ({ id, archived }: { id: string; archived: boolean }) => archiveCustomerAddress(id, archived))
}
export function useAddPreference(customerId: string) {
  return useProfileMutation(customerId, addCustomerPreference)
}
export function useRemovePreference(customerId: string) {
  return useProfileMutation(customerId, removeCustomerPreference)
}
export function useCreateComplaint(customerId: string) {
  return useProfileMutation(customerId, createCustomerComplaint)
}
export function useUpdateComplaint(customerId: string) {
  return useProfileMutation(customerId, ({ id, ...patch }: { id: string } & Parameters<typeof updateCustomerComplaint>[1]) => updateCustomerComplaint(id, patch))
}
export function useCreateRecommendation(customerId: string) {
  return useProfileMutation(customerId, createCustomerRecommendation)
}
export function useSetRecommendationStatus(customerId: string) {
  return useProfileMutation(customerId, ({ id, status }: { id: string; status: 'active' | 'dismissed' }) => setRecommendationStatus(id, status))
}
export function useUpdateNotes(customerId: string) {
  return useProfileMutation(customerId, (notes: string) => updateCustomerNotes(customerId, notes))
}
