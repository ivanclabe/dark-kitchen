import { useProducts } from '@/modules/products/hooks/useProducts'
import { Combobox } from '@/shared/ui/Combobox'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { ArrowLeft, CalendarRange, ChevronDown, ChevronUp, Copy, Power, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAddWeeklyMenuItem,
  useCopyWeeklyMenuDay,
  useMoveWeeklyMenuItem,
  useRemoveWeeklyMenuItem,
  useSetWeeklyMenuItemActive,
  useWeeklyMenu,
} from '../hooks/useWeeklyMenu'
import { DAYS_OF_WEEK, type DayOfWeek } from '../types'

const DAY_LABEL: Record<DayOfWeek, string> = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miércoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sábado',
  DOMINGO: 'Domingo',
}

const DAY_TABS: TabItem<DayOfWeek>[] = DAYS_OF_WEEK.map((day) => ({ value: day, label: DAY_LABEL[day] }))

export function WeeklyMenuPage() {
  const [day, setDay] = useState<DayOfWeek>('LUNES')
  const [productId, setProductId] = useState('')
  const [copyFrom, setCopyFrom] = useState<DayOfWeek>('LUNES')
  const { show } = useToast()

  const { data: items, isLoading } = useWeeklyMenu(day)
  const { data: products } = useProducts()

  const addItem = useAddWeeklyMenuItem(day)
  const removeItem = useRemoveWeeklyMenuItem(day)
  const setActive = useSetWeeklyMenuItemActive(day)
  const moveItem = useMoveWeeklyMenuItem(day)
  const copyDay = useCopyWeeklyMenuDay(day)

  const availableProductOptions = useMemo(() => {
    const usedIds = new Set(items?.map((item) => item.productId))
    return (products ?? [])
      .filter((p) => p.active && !usedIds.has(p.id))
      .map((p) => ({ value: p.id, label: p.name, sublabel: `$${p.price.toFixed(2)}` }))
  }, [products, items])

  async function handleAdd() {
    if (!productId) return
    const nextOrder = (items?.length ?? 0) > 0 ? Math.max(...(items ?? []).map((i) => i.displayOrder)) + 1 : 0
    try {
      await addItem.mutateAsync({ productId, displayOrder: nextOrder })
      setProductId('')
    } catch (err) {
      show(getErrorMessage(err, 'Error al agregar el plato'), 'error')
    }
  }

  async function handleCopy() {
    if (copyFrom === day) return
    try {
      await copyDay.mutateAsync(copyFrom)
      show(`Menú de ${DAY_LABEL[copyFrom]} copiado a ${DAY_LABEL[day]}.`)
    } catch (err) {
      show(getErrorMessage(err, 'Error al copiar el menú'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange size={22} className="text-brasa-500" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-50">Menú semanal</h1>
            <p className="text-sm text-neutral-400">Qué se vende cada día — se repite automáticamente cada semana.</p>
          </div>
        </div>
        <Link to="/menus" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200">
          <ArrowLeft size={14} /> Volver a menús
        </Link>
      </div>

      <Tabs value={day} onChange={setDay} items={DAY_TABS} />

      <div className={`${cardClass} flex flex-wrap items-end gap-3`}>
        <div className="min-w-64 flex-1">
          <label className="block text-sm font-medium text-neutral-300">Agregar plato a {DAY_LABEL[day]}</label>
          <Combobox
            value={productId}
            onChange={setProductId}
            options={availableProductOptions}
            placeholder="Buscar plato…"
            emptyMessage="Sin platos activos para agregar"
          />
        </div>
        <button onClick={handleAdd} disabled={!productId || addItem.isPending} className={primaryButtonClass}>
          Agregar
        </button>

        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="block text-sm font-medium text-neutral-300">Copiar desde</label>
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value as DayOfWeek)} className={`${inputClass} w-40`}>
              {DAYS_OF_WEEK.filter((d) => d !== day).map((d) => (
                <option key={d} value={d}>
                  {DAY_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleCopy} disabled={copyDay.isPending} className={secondaryButtonClass}>
            <Copy size={15} /> Copiar a {DAY_LABEL[day]}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-neutral-400">Cargando…</p>}
        {!isLoading && items?.length === 0 && (
          <p className={`${cardClass} text-neutral-400`}>{DAY_LABEL[day]} no tiene platos configurados todavía.</p>
        )}
        {items?.map((item, index) => (
          <div key={item.id} className={`${cardClass} flex items-center gap-3 !py-3`}>
            <div className="flex flex-col">
              <button
                onClick={() => moveItem.mutate({ items, id: item.id, direction: 'up' })}
                disabled={index === 0 || moveItem.isPending}
                aria-label="Subir"
                className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => moveItem.mutate({ items, id: item.id, direction: 'down' })}
                disabled={index === items.length - 1 || moveItem.isPending}
                aria-label="Bajar"
                className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            <div className={`flex-1 ${item.isActive ? '' : 'opacity-50'}`}>
              <p className="font-medium text-neutral-100">{item.productName}</p>
              <p className="text-xs text-neutral-500">${item.productPrice.toFixed(2)}</p>
            </div>

            <button
              onClick={() => setActive.mutate({ id: item.id, active: !item.isActive })}
              className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:underline"
            >
              <Power size={13} /> {item.isActive ? 'Desactivar' : 'Activar'}
            </button>
            <button
              onClick={() => removeItem.mutate(item.id)}
              className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-red-400 hover:underline"
            >
              <Trash2 size={13} /> Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
