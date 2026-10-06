import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNotifications, markNotificationsRead } from './api'
import type { NotificationFeed } from './types'

const key = (kitchenId: string) => ['account', kitchenId, 'notifications'] as const

/** The bell's feed: every minute and when the person comes back to the tab (ADR 0037, D3). */
export function useNotifications() {
  const { kitchen } = useActiveKitchen()
  return useQuery({ queryKey: key(kitchen.id), queryFn: fetchNotifications, refetchInterval: 60_000, refetchOnWindowFocus: true, staleTime: 30_000 })
}

/** Marks notices as seen, showing it at once (and undoing it if the base refuses). */
export function useMarkNotificationsRead() {
  const { kitchen } = useActiveKitchen()
  const client = useQueryClient()
  const queryKey = key(kitchen.id)
  return useMutation({
    mutationFn: markNotificationsRead,
    onMutate: async (keys: string[]) => {
      await client.cancelQueries({ queryKey })
      const before = client.getQueryData<NotificationFeed>(queryKey)
      if (before) {
        const seen = new Set(keys)
        const items = before.items.map((n) => (seen.has(n.key) ? { ...n, read: true } : n))
        client.setQueryData<NotificationFeed>(queryKey, { ...before, items, unread: items.filter((n) => !n.read).length })
      }
      return { before }
    },
    onError: (_err, _keys, ctx) => {
      if (ctx?.before) client.setQueryData(queryKey, ctx.before)
    },
  })
}
