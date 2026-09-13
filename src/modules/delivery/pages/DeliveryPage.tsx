import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState } from 'react'
import {
  useCreateRider,
  useDispatchOrder,
  useDispatchedOrders,
  useMarkDelivered,
  useReadyOrders,
  useRiders,
  useSetRiderActive,
} from '../hooks/useDelivery'
import type { ReadyOrder } from '../types'

function ReadyOrderRow({ order }: { order: ReadyOrder }) {
  const { data: riders } = useRiders()
  const dispatch = useDispatchOrder()
  const [riderId, setRiderId] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleDispatch() {
    if (!riderId) {
      setError('Selecciona un domiciliario')
      return
    }
    setError(null)
    try {
      await dispatch.mutateAsync({ orderId: order.orderId, riderId })
    } catch (err) {
      setError(getErrorMessage(err, 'Error al despachar el pedido'))
    }
  }

  return (
    <tr>
      <td className={tdClass}>{order.customerName}</td>
      <td className={tdClass}>{order.address ?? '—'}</td>
      <td className={tdClass}>${order.total.toFixed(2)}</td>
      <td className={tdClass}>
        <select value={riderId} onChange={(e) => setRiderId(e.target.value)} className={inputClass}>
          <option value="">Selecciona…</option>
          {riders?.filter((r) => r.active).map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </td>
      <td className={`${tdClass} text-right`}>
        <button onClick={handleDispatch} disabled={dispatch.isPending} className={primaryButtonClass}>
          Despachar
        </button>
      </td>
    </tr>
  )
}

function RidersManager() {
  const { data: riders } = useRiders()
  const createRider = useCreateRider()
  const setActive = useSetRiderActive()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleType, setVehicleType] = useState('')

  async function handleAdd() {
    if (!fullName.trim()) return
    await createRider.mutateAsync({ fullName, phone: phone || null, vehicleType: vehicleType || null })
    setFullName('')
    setPhone('')
    setVehicleType('')
  }

  return (
    <div className={`${cardClass} space-y-3`}>
      <h2 className="font-medium text-neutral-100">Domiciliarios</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Nombre</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Teléfono</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Vehículo</label>
          <input
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className={inputClass}
            placeholder="Moto, bicicleta…"
          />
        </div>
        <div className="flex items-end">
          <button onClick={handleAdd} disabled={createRider.isPending} className={secondaryButtonClass}>
            Agregar domiciliario
          </button>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2">
        {riders?.map((r) => (
          <li
            key={r.id}
            className={`rounded px-2 py-1 text-xs ${r.active ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-900 text-neutral-500'}`}
          >
            {r.fullName}
            {r.phone ? ` · ${r.phone}` : ''}
            <button
              onClick={() => setActive.mutate({ id: r.id, active: !r.active })}
              className="ml-2 text-neutral-400 hover:underline"
            >
              {r.active ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DeliveryPage() {
  const { data: readyOrders, isLoading: loadingReady } = useReadyOrders()
  const { data: dispatchedOrders, isLoading: loadingDispatched } = useDispatchedOrders()
  const markDelivered = useMarkDelivered()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-50">Despachos</h1>

      <RidersManager />

      <div>
        <h2 className="mb-2 font-medium text-neutral-100">Listos para despachar</h2>
        <div className={tableWrapperClass}>
          <table className="min-w-full divide-y divide-neutral-800">
            <thead className="bg-neutral-900">
              <tr>
                <th className={thClass}>Cliente</th>
                <th className={thClass}>Dirección</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Domiciliario</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {loadingReady && (
                <tr>
                  <td className={tdClass} colSpan={5}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loadingReady && readyOrders?.length === 0 && (
                <tr>
                  <td className={tdClass} colSpan={5}>
                    No hay pedidos listos para despachar.
                  </td>
                </tr>
              )}
              {readyOrders?.map((order) => (
                <ReadyOrderRow key={order.orderId} order={order} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-medium text-neutral-100">En ruta</h2>
        <div className={tableWrapperClass}>
          <table className="min-w-full divide-y divide-neutral-800">
            <thead className="bg-neutral-900">
              <tr>
                <th className={thClass}>Cliente</th>
                <th className={thClass}>Dirección</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Domiciliario</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {loadingDispatched && (
                <tr>
                  <td className={tdClass} colSpan={5}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loadingDispatched && dispatchedOrders?.length === 0 && (
                <tr>
                  <td className={tdClass} colSpan={5}>
                    No hay pedidos en ruta.
                  </td>
                </tr>
              )}
              {dispatchedOrders?.map((order) => (
                <tr key={order.orderId}>
                  <td className={tdClass}>{order.customerName}</td>
                  <td className={tdClass}>{order.address ?? '—'}</td>
                  <td className={tdClass}>${order.total.toFixed(2)}</td>
                  <td className={tdClass}>{order.riderName ?? '—'}</td>
                  <td className={`${tdClass} text-right`}>
                    <button
                      onClick={() => markDelivered.mutate(order.orderId)}
                      disabled={markDelivered.isPending}
                      className={primaryButtonClass}
                    >
                      Marcar entregado
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
