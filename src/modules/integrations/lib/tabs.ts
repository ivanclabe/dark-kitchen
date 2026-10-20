import type { Can } from '@/shared/rbac/roles'

export type IntegrationsTab = 'connection' | 'notifications' | 'inbox' | 'ordering' | 'n8n' | 'log'

const TABS: { value: IntegrationsTab; label: string }[] = [
  { value: 'inbox', label: 'Mensajes' },
  { value: 'connection', label: 'Conexión' },
  { value: 'notifications', label: 'Avisos' },
  { value: 'ordering', label: 'Pedidos por WhatsApp' },
  { value: 'n8n', label: 'n8n' },
  { value: 'log', label: 'Registro' },
]

/** Whoever only answers messages sees the inbox; the rest of WhatsApp needs integrations.view (ADR 0072). */
export function integrationsTabs(can: Can) {
  return can('integrations.view') ? TABS : TABS.filter((t) => t.value === 'inbox')
}
