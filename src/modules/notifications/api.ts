import { supabase } from '@/shared/lib/supabase'
import type { NotificationFeed } from './types'

/** Every notice of the active account for this person (ADR 0037). Reads stored data only: no AI cost. */
export async function fetchNotifications(): Promise<NotificationFeed> {
  const { data, error } = await supabase.rpc('dk_my_notifications')
  if (error) throw error
  return data as unknown as NotificationFeed
}

/** «Visto», for this person only. */
export async function markNotificationsRead(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const { error } = await supabase.rpc('dk_mark_notifications_read', { p_keys: keys.slice(0, 200) })
  if (error) throw error
}
