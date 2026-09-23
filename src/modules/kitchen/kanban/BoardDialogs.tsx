import { useDispatchOrder, useRiders } from '@/modules/delivery/hooks/useDelivery'
import { useConfirmOrder } from '@/modules/orders/hooks/useOrders'
import { Button } from '@/shared/ui/Button'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { ConfirmDialog, Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { MapPin } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useCancelKitchenOrder } from '../hooks/useKitchen'
import type { KitchenTicket } from '../types'

/**
 * NUEVO → En cola. Mismo RPC y misma advertencia que el botón "Confirmar
 * pedido" del OrderBuilder: confirmar reserva inventario y puede rechazarse
 * por falta de stock o por un plato sin receta activa.
 */
export function ConfirmOrderDialog({ ticket, onClose }: { ticket: KitchenTicket; onClose: () => void }) {
  const confirmOrder = useConfirmOrder(ticket.orderId)
  const { show } = useToast()

  async function handleConfirm() {
    try {
      await confirmOrder.mutateAsync()
      show(`Pedido #${ticket.orderNumber} confirmado y enviado a cocina.`)
      onClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo confirmar el pedido'), 'error')
    }
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => void handleConfirm()}
      title={`Confirmar pedido #${ticket.orderNumber}`}
      confirmLabel="Sí, confirmar"
      pending={confirmOrder.isPending}
      description={
        <p>
          Esto reserva el inventario necesario para los {ticket.items.length} plato(s) de {ticket.customerName} ({formatMoney(ticket.total)}) y envía la comanda a
          cocina. Si algún insumo no tiene stock suficiente, la confirmación se rechazará.
        </p>
      }
    />
  )
}

/**
 * Listo → En ruta. Mismo RPC que la antigua pantalla Despacho
 * (dk_dispatch_order): el domiciliario es obligatorio y solo se ofrecen los
 * activos. Ahora también se pueden dejar notas para el reparto — el RPC ya
 * las aceptaba y ninguna pantalla las enviaba.
 */
export function DispatchDialog({ ticket, onClose }: { ticket: KitchenTicket; onClose: () => void }) {
  const { data: riders } = useRiders()
  const dispatch = useDispatchOrder()
  const { show } = useToast()
  const [riderId, setRiderId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const activeRiders = riders?.filter((r) => r.active) ?? []

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!riderId) {
      setError('Selecciona un domiciliario')
      return
    }
    setError(null)
    try {
      await dispatch.mutateAsync({ orderId: ticket.orderId, riderId, notes: notes.trim() || undefined })
      show(`Pedido #${ticket.orderNumber} despachado.`)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'Error al despachar el pedido'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Despachar pedido #${ticket.orderNumber}`}
      description={ticket.customerName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={dispatch.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="dispatch-form" variant="primary" loading={dispatch.isPending} disabled={activeRiders.length === 0}>
            Despachar
          </Button>
        </>
      }
    >
      <form id="dispatch-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="flex items-center gap-1.5 rounded-xl border border-neutral-800/60 bg-neutral-950/60 px-3 py-2.5 text-sm text-neutral-300">
          <MapPin size={14} className="shrink-0 text-neutral-500" aria-hidden />
          {ticket.address ?? 'El cliente no tiene dirección registrada'}
        </p>
        <FormField
          label="Domiciliario"
          required
          error={error}
          hint={activeRiders.length === 0 ? 'No hay domiciliarios activos — actívalos desde "Domiciliarios".' : undefined}
        >
          {(a11y) => (
            <Select {...a11y} value={riderId} onChange={(e) => setRiderId(e.target.value)} autoFocus>
              <option value="">Selecciona…</option>
              {activeRiders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                  {r.vehicleType ? ` · ${r.vehicleType}` : ''}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Notas para el reparto">
          {(a11y) => <Input {...a11y} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. tocar el timbre, pagar en efectivo…" />}
        </FormField>
      </form>
    </Modal>
  )
}

/**
 * Cancelar desde el tablero. Mismo RPC (dk_cancel_order) y misma advertencia
 * del OrderBuilder; ahora con motivo opcional — el RPC ya lo aceptaba y la
 * columna Cancelado lo muestra, pero ninguna pantalla lo enviaba.
 */
export function CancelOrderDialog({ ticket, onClose }: { ticket: KitchenTicket; onClose: () => void }) {
  const cancelOrder = useCancelKitchenOrder()
  const { show } = useToast()
  const [reason, setReason] = useState('')

  async function handleCancel() {
    try {
      await cancelOrder.mutateAsync({ orderId: ticket.orderId, reason: reason.trim() || undefined })
      show(`Pedido #${ticket.orderNumber} cancelado.`)
      onClose()
    } catch (err) {
      show(getErrorMessage(err, `No se pudo cancelar el pedido ${ticket.orderNumber}.`), 'error')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancelar pedido #${ticket.orderNumber}`}
      description={ticket.customerName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={cancelOrder.isPending}>
            Volver
          </Button>
          <Button variant="danger" onClick={() => void handleCancel()} loading={cancelOrder.isPending}>
            Sí, cancelar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p>
          Esta acción no se puede deshacer. Si el pedido ya reservó inventario, la reserva se libera; si algún plato ya fue preparado (consumo registrado), se
          generará una devolución que quedará marcada para revisión.
        </p>
        <FormField label="Motivo (opcional)">
          {(a11y) => <Input {...a11y} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. el cliente se arrepintió" autoFocus />}
        </FormField>
      </div>
    </Modal>
  )
}
