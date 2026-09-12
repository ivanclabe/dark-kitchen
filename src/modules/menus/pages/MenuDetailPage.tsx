import { useProducts } from '@/modules/products/hooks/useProducts'
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAddMenuItem, useMenuItems, useMenus, useRemoveMenuItem, useSetMenuItemActive } from '../hooks/useMenus'

export function MenuDetailPage() {
  const { id } = useParams<{ id: string }>()
  const menuId = id ?? ''

  const { data: menus } = useMenus()
  const { data: items, isLoading } = useMenuItems(menuId)
  const { data: products } = useProducts()
  const addItem = useAddMenuItem(menuId)
  const setActive = useSetMenuItemActive(menuId)
  const removeItem = useRemoveMenuItem(menuId)

  const menu = menus?.find((m) => m.id === menuId)

  const [productId, setProductId] = useState('')
  const [specialPrice, setSpecialPrice] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  const availableProducts = products?.filter((p) => !items?.some((i) => i.productId === p.id))

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await addItem.mutateAsync({
        productId,
        specialPrice: specialPrice ? Number(specialPrice) : null,
        startTime: startTime || null,
        endTime: endTime || null,
      })
      setProductId('')
      setSpecialPrice('')
      setStartTime('')
      setEndTime('')
    } catch (err) {
      setError(getErrorMessage(err, 'Error al agregar el plato al menú'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-50">Menú — {menu?.name ?? '…'}</h1>
        <Link to="/menus" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Volver a menús
        </Link>
      </div>

      <form onSubmit={handleAdd} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5`}>
        <div className="lg:col-span-2">
          <label className={labelClass}>Plato</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass} required>
            <option value="">Selecciona…</option>
            {availableProducts?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (${p.price.toFixed(2)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Precio especial</label>
          <input
            type="number"
            step="any"
            min="0"
            value={specialPrice}
            onChange={(e) => setSpecialPrice(e.target.value)}
            className={inputClass}
            placeholder="Precio normal"
          />
        </div>
        <div>
          <label className={labelClass}>Desde</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Hasta</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
        </div>
        <div className="flex items-end lg:col-span-5">
          <button type="submit" disabled={addItem.isPending} className={primaryButtonClass}>
            Agregar al menú
          </button>
        </div>
        {error && <p className="text-sm text-red-400 lg:col-span-5">{error}</p>}
      </form>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Plato</th>
              <th className={thClass}>Precio</th>
              <th className={thClass}>Horario</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={5}>
                  Cargando…
                </td>
              </tr>
            )}
            {items?.map((item) => (
              <tr key={item.id} className={item.active ? '' : 'opacity-50'}>
                <td className={tdClass}>{item.productName}</td>
                <td className={tdClass}>
                  {item.specialPrice !== null ? (
                    <>
                      <span className="text-emerald-400">${item.specialPrice.toFixed(2)}</span>{' '}
                      <span className="text-xs text-neutral-500 line-through">${item.productPrice.toFixed(2)}</span>
                    </>
                  ) : (
                    `$${item.productPrice.toFixed(2)}`
                  )}
                </td>
                <td className={tdClass}>
                  {item.startTime && item.endTime ? `${item.startTime.slice(0, 5)}–${item.endTime.slice(0, 5)}` : 'Todo el día'}
                </td>
                <td className={tdClass}>{item.active ? 'Activo' : 'Inactivo'}</td>
                <td className={`${tdClass} space-x-3 text-right`}>
                  <button
                    onClick={() => setActive.mutate({ id: item.id, active: !item.active })}
                    className="text-neutral-300 hover:underline"
                  >
                    {item.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => removeItem.mutate(item.id)} className="text-neutral-400 hover:underline">
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
