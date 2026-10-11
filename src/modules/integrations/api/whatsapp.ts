/**
 * ADR 0055 — WhatsApp e Integraciones. Secrets only travel in (dk_wa_connect);
 * Meta is only called from Edge Functions (dk-whatsapp-admin, -dispatch).
 */
import { supabase } from '@/shared/lib/supabase'
import type { OrderingMode, OutboxRow, OutboxStatus, WaConversation, WaEvent, WaMessage, WaMode, WaSettings } from '../types'

export async function getWaSettings(): Promise<WaSettings> {
  const { data, error } = await supabase.rpc('dk_wa_settings')
  if (error) throw error
  return data as unknown as WaSettings
}

/** Saves the IDs and, when given, the secrets (in Vault). Returns the verify token only when a new one was created. */
export async function connectWhatsapp(input: { phoneNumberId: string; wabaId: string; accessToken?: string; appSecret?: string }): Promise<{ verifyToken: string | null }> {
  const { data, error } = await supabase.rpc('dk_wa_connect', {
    p_phone_number_id: input.phoneNumberId,
    p_waba_id: input.wabaId,
    p_access_token: input.accessToken || undefined,
    p_app_secret: input.appSecret || undefined,
  })
  if (error) throw error
  return data as unknown as { verifyToken: string | null }
}

export async function regenerateVerifyToken(): Promise<string> {
  const { data, error } = await supabase.rpc('dk_wa_regenerate_verify_token')
  if (error) throw error
  return (data as unknown as { verifyToken: string }).verifyToken
}

export async function disconnectWhatsapp(): Promise<void> {
  const { error } = await supabase.rpc('dk_wa_disconnect')
  if (error) throw error
}

export async function saveWaSettings(patch: { mode?: WaMode; testRecipients?: string[]; notificationsEnabled?: boolean; orderingMode?: OrderingMode; orderingGreeting?: string }): Promise<void> {
  const { error } = await supabase.rpc('dk_wa_save_settings', { p: patch as never })
  if (error) throw error
}

export async function saveWaTemplate(input: { event: WaEvent; enabled: boolean; templateName?: string; language?: string }): Promise<void> {
  const { error } = await supabase.rpc('dk_wa_save_template', {
    p_event: input.event,
    p_enabled: input.enabled,
    p_template_name: input.templateName,
    p_language: input.language,
  })
  if (error) throw error
}

export async function sendWaTest(event: WaEvent, to: string): Promise<string> {
  const { data, error } = await supabase.rpc('dk_wa_send_test', { p_event: event, p_to: to })
  if (error) throw error
  return data as unknown as string
}

export async function retryWaMessage(id: string): Promise<void> {
  const { error } = await supabase.rpc('dk_wa_retry', { p_id: id })
  if (error) throw error
}

export async function listWaLog(status: OutboxStatus | 'all', limit = 100): Promise<(OutboxRow & { order: { order_number: number } | null })[]> {
  let query = supabase
    .from('dk_wa_outbox')
    .select('id, kind, order_id, event, recipient, payload, status, attempts, next_attempt_at, error_code, last_error, created_at, sent_at, delivered_at, read_at, order:dk_orders(order_number)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as (OutboxRow & { order: { order_number: number } | null })[]
}

export class WaAdminError extends Error {}

/** Graph tasks, done by dk-whatsapp-admin with the account's own token. */
export async function waAdmin<T = Record<string, unknown>>(action: 'check' | 'create_templates' | 'sync_templates'): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('dk-whatsapp-admin', { body: { action } })
  if (error) {
    const context = (error as { context?: Response }).context
    const payload = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null
    throw new WaAdminError(payload?.message ?? 'Meta no respondió. Intenta de nuevo.')
  }
  return data as T
}

// ---------------------------------------------------------------------------
// Fase B: conversations (inbox), ordering mode, n8n
// ---------------------------------------------------------------------------
export async function listConversations(filter: 'attention' | 'all'): Promise<WaConversation[]> {
  let query = supabase
    .from('dk_wa_conversations')
    .select('id, phone, customer_id, customer_name, status, needs_attention, attention_reason, unread, last_inbound_at, last_message_at, last_order_id, last_order:dk_orders(order_number, status)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100)
  if (filter === 'attention') query = query.eq('needs_attention', true)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as WaConversation[]
}

export async function listMessages(conversationId: string): Promise<WaMessage[]> {
  const { data, error } = await supabase
    .from('dk_wa_messages')
    .select('id, direction, author, body, kind, created_at, outbox:dk_wa_outbox(status, last_error)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(300)
  if (error) throw error
  return (data ?? []) as unknown as WaMessage[]
}

export async function sendWaText(conversationId: string, text: string): Promise<void> {
  const { error } = await supabase.rpc('dk_wa_send_text', { p_conversation_id: conversationId, p_text: text })
  if (error) throw error
}

export async function setWaConversation(conversationId: string, status: 'bot' | 'human' | 'closed' | null): Promise<void> {
  const { error } = await supabase.rpc('dk_wa_set_conversation', { p_conversation_id: conversationId, p_status: status ?? undefined })
  if (error) throw error
}

/** Saves the n8n webhook. The signing secret comes back only when it is created. */
export async function saveEndpoint(input: { url: string; events: string[]; enabled: boolean }): Promise<{ secret: string | null }> {
  const { data, error } = await supabase.rpc('dk_integration_save_endpoint', { p_url: input.url, p_events: input.events, p_enabled: input.enabled })
  if (error) throw error
  return data as unknown as { secret: string | null }
}

export async function rotateEndpointSecret(): Promise<string> {
  const { data, error } = await supabase.rpc('dk_integration_rotate_secret')
  if (error) throw error
  return (data as unknown as { secret: string }).secret
}

export async function deleteEndpoint(): Promise<void> {
  const { error } = await supabase.rpc('dk_integration_delete_endpoint')
  if (error) throw error
}

export async function testEndpoint(): Promise<void> {
  const { error } = await supabase.rpc('dk_integration_test')
  if (error) throw error
}
