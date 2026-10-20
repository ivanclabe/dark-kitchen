import { Badge } from '@/shared/ui/Badge'
import { Button, IconButton } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormField, Input } from '@/shared/ui/FormField'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Copy, KeyRound, Send, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import { useEndpointActions } from '../hooks'
import type { WaSettings } from '../types'

const EVENTS = [
  { key: 'order.status_changed', label: 'Cambios de estado de los pedidos', hint: 'Cada vez que un pedido se confirma, se prepara, sale, se entrega o se cancela.' },
  { key: 'whatsapp.message.received', label: 'Mensajes de WhatsApp recibidos', hint: 'Cada mensaje de un cliente (en modo n8n, tu flujo es quien responde).' },
]

function Copyable({ value }: { value: string }) {
  const { show } = useToast()
  return (
    <div className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2">
      <code className="min-w-0 flex-1 text-xs break-all text-neutral-100">{value}</code>
      <IconButton icon={Copy} size="sm" variant="ghost" aria-label="Copiar" onClick={() => void navigator.clipboard.writeText(value).then(() => show('Copiado.'))} />
    </div>
  )
}

/**
 * n8n (ADR 0055): the account's n8n receives signed events (HMAC-SHA256 with a
 * secret shown once) and acts through Quanela — it answers on WhatsApp and
 * creates orders with the same rules, without ever holding the Meta token.
 */
export function N8nTab({ settings }: { settings: WaSettings }) {
  const { show } = useToast()
  const { kitchen } = useActiveKitchen()
  const actions = useEndpointActions()
  const ep = settings.endpoint
  const [url, setUrl] = useState(ep?.url ?? '')
  const [events, setEvents] = useState<string[]>(ep?.events ?? EVENTS.map((e) => e.key))
  const [enabled, setEnabled] = useState(ep?.enabled ?? true)
  const [secret, setSecret] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const canManage = settings.canManage

  async function save() {
    try {
      const r = await actions.save.mutateAsync({ url, events, enabled })
      if (r.secret) setSecret(r.secret)
      show('Integración guardada.')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar'), 'error')
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <Card title="Webhook de n8n" icon={Workflow} description="Crea en n8n un flujo con un nodo Webhook (POST) y pega aquí su URL de producción.">
          <div className="space-y-4">
            <FormField label="URL del webhook">
              {(a11y) => <Input {...a11y} value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://tu-n8n.com/webhook/quanela" disabled={!canManage} />}
            </FormField>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-neutral-200">Eventos</legend>
              {EVENTS.map((e) => (
                <label key={e.key} className="flex items-start gap-2.5 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    className="mt-1 accent-neutral-50"
                    checked={events.includes(e.key)}
                    disabled={!canManage}
                    onChange={(x) => setEvents((list) => (x.target.checked ? [...list, e.key] : list.filter((k) => k !== e.key)))}
                  />
                  <span>
                    {e.label}
                    <span className="block text-xs text-neutral-500">{e.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-300">Enviar eventos</span>
              <Switch checked={enabled} onChange={setEnabled} disabled={!canManage} label="Enviar eventos a n8n" />
            </div>
            {secret && (
              <div className="space-y-1">
                <p className="text-xs text-amber-300">Secreto de firma: cópialo ahora en n8n, no se vuelve a mostrar.</p>
                <Copyable value={secret} />
              </div>
            )}
            {canManage && (
              <div className="flex flex-wrap justify-end gap-2">
                {ep && (
                  <>
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                      Quitar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={KeyRound}
                      loading={actions.rotate.isPending}
                      onClick={() => void actions.rotate.mutateAsync().then(setSecret, (err) => show(getErrorMessage(err, 'No se pudo'), 'error'))}
                    >
                      Nuevo secreto
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Send}
                      loading={actions.test.isPending}
                      onClick={() => void actions.test.mutateAsync().then(() => show('Evento de prueba en camino; míralo en Registro.'), (err) => show(getErrorMessage(err, 'No se pudo'), 'error'))}
                    >
                      Probar
                    </Button>
                  </>
                )}
                <Button size="sm" variant="primary" loading={actions.save.isPending} disabled={!url || events.length === 0} onClick={() => void save()}>
                  Guardar
                </Button>
              </div>
            )}
            {ep && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                Última entrega: {ep.lastDeliveryAt ? formatDateTime(ep.lastDeliveryAt) : 'ninguna'}
                {ep.lastStatus != null && <Badge tone={ep.lastStatus >= 200 && ep.lastStatus < 300 ? 'success' : 'danger'}>HTTP {ep.lastStatus}</Badge>}
                {ep.lastError && <span className="text-red-400">{ep.lastError}</span>}
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card title="Cómo lo usa tu flujo" icon={KeyRound}>
        <div className="space-y-3 text-sm text-neutral-300">
          <p>Cada evento llega con:</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-neutral-400">
            <li>
              <code>X-quanela-Event</code>: el evento; <code>X-quanela-Delivery</code>: su id.
            </li>
            <li>
              <code>X-quanela-Signature</code>: <code>sha256=</code> + HMAC-SHA256 del cuerpo con tu secreto. Verifícala en n8n antes de actuar.
            </li>
          </ul>
          <p>Para responder y crear pedidos, tu flujo entra como un usuario de servicio con rol Caja (Usuarios y permisos) y llama, con el encabezado de la cuenta:</p>
          <Copyable value={`x-dk-kitchen-id: ${kitchen.id}`} />
          <ul className="list-disc space-y-1 pl-4 text-xs text-neutral-400">
            <li>
              <code>dk_wa_send_text(p_conversation_id, p_text, p_take_over := false)</code>: responder por WhatsApp.
            </li>
            <li>
              <code>dk_wa_place_order_for(p_conversation_id, p_order)</code>: crear el pedido (con <code>idempotencyKey</code> = el wamid del mensaje).
            </li>
            <li>
              <code>dk_public_menu(slug)</code>: el menú de hoy con precios y disponibilidad.
            </li>
          </ul>
          <p className="text-xs text-neutral-500">Hay flujos de ejemplo listos para importar en la guía de n8n de quanela.</p>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          void actions.remove.mutateAsync().then(
            () => {
              setConfirmDelete(false)
              setUrl('')
              setSecret(null)
              show('Integración quitada.')
            },
            (err) => show(getErrorMessage(err, 'No se pudo'), 'error'),
          )
        }
        pending={actions.remove.isPending}
        title="¿Quitar la integración con n8n?"
        description="Se borra el secreto de firma y dejan de enviarse eventos. Si el modo de pedidos es n8n, los mensajes pasarán a la bandeja."
        confirmLabel="Quitar"
        danger
      />
    </div>
  )
}
