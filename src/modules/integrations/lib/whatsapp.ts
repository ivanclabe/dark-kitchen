import type { MetaStatus, OutboxStatus, WaEvent, WaVar } from '../types'

/** ADR 0055 — labels and helpers of the WhatsApp module (pure). */
export const EVENTS: { event: WaEvent; label: string; when: string }[] = [
  { event: 'order_confirmed', label: 'Pedido confirmado', when: 'Cuando el pedido entra a cocina.' },
  { event: 'order_preparing', label: 'En preparación', when: 'Cuando cocina empieza el primer plato.' },
  { event: 'order_ready_pickup', label: 'Listo para recoger', when: 'Cuando está listo y el cliente lo recoge en el local.' },
  { event: 'order_ready_delivery', label: 'Listo (domicilio)', when: 'Cuando está listo y sale a domicilio.' },
  { event: 'order_dispatched', label: 'En camino', when: 'Cuando se despacha con el domiciliario.' },
  { event: 'order_delivered', label: 'Entregado', when: 'Cuando se marca como entregado.' },
  { event: 'order_cancelled', label: 'Cancelado', when: 'Cuando se cancela, con el motivo si se escribió.' },
]

export function eventLabel(event: string): string {
  if (event === 'reply') return 'Respuesta en la conversación'
  if (event === 'custom') return 'Plantilla (n8n)'
  if (event.startsWith('webhook:')) {
    const [, name, status] = event.split(':')
    return `n8n · ${name === 'order.status_changed' ? `pedido ${status?.toLowerCase().replace('_', ' ') ?? ''}`.trim() : name === 'whatsapp.message.received' ? 'mensaje recibido' : name === 'integration.test' ? 'prueba' : name}`
  }
  return EVENTS.find((e) => e.event === event)?.label ?? event
}

export const VAR_LABEL: Record<WaVar, string> = {
  customer_name: 'Nombre del cliente',
  business_name: 'Nombre del negocio',
  order_number: 'Número del pedido',
  tracking_url: 'Enlace de seguimiento',
  reason: 'Motivo de cancelación',
}

export const SAMPLE: Record<WaVar, string> = {
  customer_name: 'Laura',
  business_name: 'Tu negocio',
  order_number: '123',
  tracking_url: 'quanela.com/menu/…/pedido/…',
  reason: 'nos quedamos sin gas',
}

/** The body with its {{n}} filled with sample values (what the customer would read). */
export function previewBody(body: string, params: WaVar[], sample: Partial<Record<WaVar, string>> = {}): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const key = params[Number(n) - 1]
    return key ? (sample[key] ?? SAMPLE[key]) : `{{${n}}}`
  })
}

export const META_STATUS: Record<MetaStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  approved: { label: 'Aprobada', tone: 'success' },
  pending: { label: 'En revisión', tone: 'warning' },
  rejected: { label: 'Rechazada', tone: 'danger' },
  paused: { label: 'Pausada', tone: 'danger' },
  disabled: { label: 'Desactivada', tone: 'danger' },
  not_created: { label: 'Sin crear en Meta', tone: 'neutral' },
  unknown: { label: 'Sin verificar', tone: 'neutral' },
}

export const OUTBOX_STATUS: Record<OutboxStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  queued: { label: 'En cola', tone: 'neutral' },
  sending: { label: 'Enviando', tone: 'info' },
  sent: { label: 'Enviado', tone: 'info' },
  delivered: { label: 'Entregado', tone: 'success' },
  read: { label: 'Leído', tone: 'success' },
  failed: { label: 'Falló', tone: 'danger' },
  skipped: { label: 'No enviado', tone: 'warning' },
}

/** The single webhook URL for every account (Meta → Quanela). */
export function webhookUrl(supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? ''): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/dk-whatsapp-webhook`
}

/** +573001112233 → +57 300 111 2233 (enough for reading a list). */
export function prettyPhone(e164: string): string {
  const m = /^\+(57)(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164
}
