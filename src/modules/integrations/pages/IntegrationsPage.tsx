import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SubNav, type SubNavItem } from '@/shared/ui/SubNav'
import { MessageCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConnectionTab } from '../components/ConnectionTab'
import { InboxTab } from '../components/InboxTab'
import { LogTab } from '../components/LogTab'
import { N8nTab } from '../components/N8nTab'
import { NotificationsTab } from '../components/NotificationsTab'
import { OrderingTab } from '../components/OrderingTab'
import { useWaSettings } from '../hooks'

type Tab = 'connection' | 'notifications' | 'inbox' | 'ordering' | 'n8n' | 'log'

const TABS: SubNavItem<Tab>[] = [
  { value: 'inbox', label: 'Mensajes' },
  { value: 'connection', label: 'Conexión' },
  { value: 'notifications', label: 'Avisos' },
  { value: 'ordering', label: 'Pedidos por WhatsApp' },
  { value: 'n8n', label: 'n8n' },
  { value: 'log', label: 'Registro' },
]

/**
 * WhatsApp e Integraciones (ADR 0055): each account connects its own official
 * WhatsApp number (Meta Cloud API) and its customers get the status of their
 * orders. Orders and kitchen work as always; a notice never holds them back.
 */
export function IntegrationsPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const { path, can } = useActiveKitchen()
  const settings = useWaSettings()
  // Caja (whatsapp.reply) sees the inbox only; configuration needs integrations.view.
  const tabs = can('integrations.view') ? TABS : TABS.filter((t) => t.value === 'inbox')
  const fallback: Tab = !can('integrations.view') ? 'inbox' : settings.data?.account?.status === 'connected' ? 'inbox' : 'connection'
  const tab: Tab = tabs.find((t) => t.value === tabParam)?.value ?? fallback
  const attention = settings.data?.counts.attention ?? 0
  const account = settings.data?.account ?? null

  return (
    <Page>
      <PageHeader
        help="whatsapp"
        title="WhatsApp e Integraciones"
        icon={MessageCircle}
        description="Tu número oficial de WhatsApp para avisarles a tus clientes cómo va su pedido."
        meta={
          !account ? (
            <Badge tone="neutral">Sin conectar</Badge>
          ) : account.status === 'connected' ? (
            <Badge tone="success" dot>
              {account.mode === 'live' ? 'Conectado' : account.mode === 'test' ? 'Conectado · modo prueba' : 'Conectado · simulador'}
            </Badge>
          ) : account.status === 'error' ? (
            <Badge tone="danger" dot>
              Error de conexión
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Falta verificar
            </Badge>
          )
        }
      />
      <SubNav
        label="Secciones de WhatsApp"
        items={tabs.map((t) => (t.value === 'inbox' && attention > 0 ? { ...t, label: `Mensajes (${attention})` } : t))}
        value={tab}
        onChange={(next) => navigate(path(`/integrations/${next}`))}
      />
      {settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : settings.isLoading || !settings.data ? (
        <LoadingState variant="block" label="Cargando…" />
      ) : tab === 'connection' ? (
        <ConnectionTab settings={settings.data} />
      ) : tab === 'notifications' ? (
        <NotificationsTab settings={settings.data} />
      ) : tab === 'inbox' ? (
        <InboxTab orderingMode={settings.data.account?.orderingMode ?? 'off'} canReply={settings.data.canReply} />
      ) : tab === 'ordering' ? (
        <OrderingTab key={settings.data.account?.orderingMode} settings={settings.data} />
      ) : tab === 'n8n' ? (
        <N8nTab settings={settings.data} />
      ) : (
        <LogTab canManage={settings.data.canManage} />
      )}
    </Page>
  )
}
