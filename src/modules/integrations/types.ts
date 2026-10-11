/** ADR 0055 — WhatsApp e Integraciones: what the database returns. Secrets never come here. */
export type WaMode = 'test' | 'live' | 'simulator'
export type WaStatus = 'pending' | 'connected' | 'error'
export type WaEvent =
  | 'order_confirmed'
  | 'order_preparing'
  | 'order_ready_pickup'
  | 'order_ready_delivery'
  | 'order_dispatched'
  | 'order_delivered'
  | 'order_cancelled'
export type WaVar = 'customer_name' | 'business_name' | 'order_number' | 'tracking_url' | 'reason'
export type MetaStatus = 'not_created' | 'pending' | 'approved' | 'rejected' | 'paused' | 'disabled' | 'unknown'
export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped'

export interface WaAccount {
  phoneNumberId: string
  wabaId: string
  displayPhone: string | null
  verifiedName: string | null
  qualityRating: string | null
  mode: WaMode
  testRecipients: string[]
  status: WaStatus
  notificationsEnabled: boolean
  hasAccessToken: boolean
  hasAppSecret: boolean
  hasVerifyToken: boolean
  lastCheckAt: string | null
  lastError: string | null
  connectedAt: string | null
  orderingMode: OrderingMode
  orderingGreeting: string | null
}

export interface WaTemplate {
  event: WaEvent
  enabled: boolean
  templateName: string
  language: string
  body: string | null
  params: WaVar[]
  suggested: boolean
  metaStatus: MetaStatus
  metaReason: string | null
}

export interface WaSettings {
  account: WaAccount | null
  templates: WaTemplate[]
  endpoint: IntegrationEndpoint | null
  featureEnabled: boolean
  orderingFeatureEnabled: boolean
  orderingConfigured: boolean
  canManage: boolean
  canReply: boolean
  counts: { today: number; failed: number; delivered: number; attention: number }
}

export interface OutboxRow {
  id: string
  kind: 'template' | 'text' | 'webhook'
  order_id: string | null
  event: string
  recipient: string
  payload: { template?: string; test?: boolean; vars?: Record<string, string | null> }
  status: OutboxStatus
  attempts: number
  next_attempt_at: string
  error_code: string | null
  last_error: string | null
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
}

export type OrderingMode = 'off' | 'ai' | 'n8n'

export interface WaConversation {
  id: string
  phone: string
  customer_id: string | null
  customer_name: string | null
  status: 'bot' | 'human' | 'closed'
  needs_attention: boolean
  attention_reason: string | null
  unread: number
  last_inbound_at: string | null
  last_message_at: string | null
  last_order_id: string | null
  last_order: { order_number: number; status: string } | null
}

export interface WaMessage {
  id: string
  direction: 'in' | 'out'
  author: 'customer' | 'assistant' | 'staff' | 'system'
  body: string | null
  kind: string
  created_at: string
  outbox: { status: OutboxStatus; last_error: string | null } | null
}

export interface IntegrationEndpoint {
  url: string
  events: string[]
  enabled: boolean
  lastStatus: number | null
  lastError: string | null
  lastDeliveryAt: string | null
}
