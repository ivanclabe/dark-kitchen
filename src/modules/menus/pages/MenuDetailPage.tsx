import { useProducts } from '@/modules/products/hooks/useProducts'
import { Combobox } from '@/shared/ui/Combobox'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { SkeletonTableRows } from '@/shared/ui/Skeleton'
import { getErrorMessage } from '@/shared/utils/errors'
import { ArrowLeft, Power, Trash2, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
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

  const availableProducts = useMemo(
    () => products?.filter((p) => !items?.some((i) => i.productId === p.id)),
    [products, items],
  )

  const productOptions = useMemo(
    () => availableProducts?.map((p) => ({ value: p.id, label: p.name, sublabel: `$${p.price.toFixed(2)}` })) ?? [],
    [availableProducts],
  )

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
        <div className="flex items-center gap-2">
          <UtensilsCrossed size={22} className="text-brasa-500" />
          <h1 className="text-2xl font-semibold text-neutral-50">Menú — {menu?.name ?? '…'}</h1>
        </div>
        <Link to="/menus" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200">
          <ArrowLeft size={14} /> Volver a menús
        </Link>
      </div>

      <form onSubmit={handleAdd} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5`}>
        <div className="lg:col-span-2">
          <label className={labelClass}>Plato</label>
          <Combobox
            value={productId}
            onChange={setProductId}
            options={productOptions}
            placeholder="Buscar plato…"
            emptyMessage="Sin platos disponibles con ese nombre"
            required
          />
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

      {!isLoading && items?.length === 0 ? (
        <Card>
          <EmptyState
            icon={UtensilsCrossed}
            title="Sin platos en este menú"
            description="Agrega un plato con el buscador de arriba para empezar a armarlo."
          />
        </Card>
      ) : (
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
              {isLoading && <SkeletonTableRows rows={3} cols={5} />}
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
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-300'
                      }`}
                    >
                      {item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className={`${tdClass} space-x-3 text-right`}>
                    <button
                      onClick={() => setActive.mutate({ id: item.id, active: !item.active })}
                      className="inline-flex items-center gap-1 text-neutral-300 hover:underline"
                    >
                      <Power size={13} /> {item.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => removeItem.mutate(item.id)}
                      className="inline-flex items-center gap-1 text-neutral-400 hover:text-red-400 hover:underline"
                    >
                      <Trash2 size={13} /> Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
