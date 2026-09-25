import { supabase } from '@/shared/lib/supabase'

export interface PlatformKitchen {
  id: string
  slug: string
  name: string
  active: boolean
  createdAt: string
  membersActive: number
  admins: number
  orders30d: number
  lastOrderAt: string | null
  organizationName: string
}

export async function listPlatformKitchens(): Promise<PlatformKitchen[]> {
  const { data, error } = await supabase.rpc('dk_admin_kitchens')
  if (error) throw error
  return data.map((r) => ({
    id: r.kitchen_id,
    slug: r.slug,
    name: r.name,
    active: r.active,
    createdAt: r.created_at,
    membersActive: r.members_active,
    admins: r.admins,
    orders30d: r.orders_30d,
    lastOrderAt: r.last_order_at,
    organizationName: r.organization_name,
  }))
}

export async function setKitchensActive(ids: string[], active: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('dk_set_kitchens_active', { p_kitchen_ids: ids, p_active: active })
  if (error) throw error
  return data
}
