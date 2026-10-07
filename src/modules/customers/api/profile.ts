import { supabase } from '@/shared/lib/supabase'
import type {
  AddressInput,
  ComplaintInput,
  ComplaintStatus,
  CustomerOrderStats,
  CustomerProfileData,
  PreferenceKind,
  PreferenceOptions,
} from '../types'

/**
 * The customer 360° sheet (ADR 0040). One read for its sections (names
 * resolved in the database, with customers.view); writes go to their own
 * tables (RLS: customers.edit) or, for addresses, through the functions that
 * keep dk_customers.address — the last delivery address — in step.
 */
export async function fetchCustomerProfile(id: string): Promise<CustomerProfileData | null> {
  const { data, error } = await supabase.rpc('dk_customer_profile', { p_id: id })
  if (error) throw error
  return (data as unknown as CustomerProfileData | null) ?? null
}

/** Behaviour from the real orders (needs orders.view). */
export async function fetchCustomerOrderStats(id: string): Promise<CustomerOrderStats | null> {
  const { data, error } = await supabase.rpc('dk_customer_order_stats', { p_id: id })
  if (error) throw error
  return (data as unknown as CustomerOrderStats | null) ?? null
}

/** The dishes and ingredients that can be chosen as preferences (id and name only). */
export async function fetchPreferenceOptions(): Promise<PreferenceOptions> {
  const { data, error } = await supabase.rpc('dk_customer_preference_options')
  if (error) throw error
  return data as unknown as PreferenceOptions
}

export async function saveCustomerAddress(input: AddressInput): Promise<string> {
  const { data, error } = await supabase.rpc('dk_customer_address_save', {
    p_customer_id: input.customerId,
    p_id: input.id ?? undefined,
    p_address: input.address,
    p_reference: input.reference ?? undefined,
    p_recipient_name: input.recipientName ?? undefined,
    p_delivery_notes: input.deliveryNotes ?? undefined,
    p_is_frequent: input.isFrequent ?? false,
    p_make_current: input.makeCurrent ?? false,
  })
  if (error) throw error
  return data as string
}

export async function archiveCustomerAddress(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.rpc('dk_customer_address_archive', { p_id: id, p_archived: archived })
  if (error) throw error
}

export async function addCustomerPreference(input: {
  customerId: string
  kind: PreferenceKind
  productId?: string | null
  ingredientId?: string | null
  label?: string | null
  note?: string | null
}): Promise<void> {
  const { error } = await supabase.from('dk_customer_preferences').insert({
    customer_id: input.customerId,
    kind: input.kind,
    product_id: input.productId ?? null,
    ingredient_id: input.ingredientId ?? null,
    label: input.label?.trim() || null,
    note: input.note?.trim() || null,
  })
  if (error) throw error
}

export async function removeCustomerPreference(id: string): Promise<void> {
  const { error } = await supabase.from('dk_customer_preferences').delete().eq('id', id)
  if (error) throw error
}

export async function createCustomerComplaint(input: ComplaintInput): Promise<void> {
  const { error } = await supabase.from('dk_customer_complaints').insert({
    customer_id: input.customerId,
    order_id: input.orderId || null,
    category: input.category,
    description: input.description.trim(),
    status: input.status ?? 'pending',
    resolution: input.resolution?.trim() || null,
    internal_notes: input.internalNotes?.trim() || null,
  })
  if (error) throw error
}

/** The follow-up of a complaint: its status, the answer and internal notes (what was reported never changes). */
export async function updateCustomerComplaint(id: string, patch: { status: ComplaintStatus; resolution: string | null; internalNotes: string | null }): Promise<void> {
  const { error } = await supabase
    .from('dk_customer_complaints')
    .update({ status: patch.status, resolution: patch.resolution?.trim() || null, internal_notes: patch.internalNotes?.trim() || null })
    .eq('id', id)
  if (error) throw error
}

export async function createCustomerRecommendation(input: { customerId: string; productId?: string | null; title: string; reason?: string | null }): Promise<void> {
  const { error } = await supabase.from('dk_customer_recommendations').insert({
    customer_id: input.customerId,
    product_id: input.productId || null,
    title: input.title.trim(),
    reason: input.reason?.trim() || null,
  })
  if (error) throw error
}

export async function setRecommendationStatus(id: string, status: 'active' | 'dismissed'): Promise<void> {
  const { error } = await supabase
    .from('dk_customer_recommendations')
    .update({ status, dismissed_at: status === 'dismissed' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

/** The general note (dk_customers.notes), on its own: nothing else of the customer is touched. */
export async function updateCustomerNotes(id: string, notes: string): Promise<void> {
  const { error } = await supabase.from('dk_customers').update({ notes: notes.trim() || null }).eq('id', id)
  if (error) throw error
}
