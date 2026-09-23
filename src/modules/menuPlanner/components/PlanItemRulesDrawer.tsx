import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { CalendarRange, Power, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAddMenuPlanItemForDates, useRemoveMenuPlanItem, useUpdateMenuPlanItemRules } from '../hooks/useMenuPlan'
import { addDays, formatDayHeader } from '../lib/week'
import type { MenuPlanItem } from '../types'

/**
 * Todas las reglas de disponibilidad de UNA asignación (plato+fecha) en un
 * solo lugar: activo/agotado, horario, precio promocional, límite de
 * unidades, "hasta agotar existencias" — y "aplicar hasta" para cubrir un
 * rango de fechas sin repetir el arrastre día por día. El padre le pasa una
 * `key` distinta por cada item abierto, así que monta fresco con los
 * valores correctos sin necesitar un efecto que resetee el estado a mano.
 */
export function PlanItemRulesDrawer({ item, onClose }: { item: MenuPlanItem | null; onClose: () => void }) {
  const updateRules = useUpdateMenuPlanItemRules()
  const removeItem = useRemoveMenuPlanItem()
  const applyRange = useAddMenuPlanItemForDates()
  const { show } = useToast()

  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [startTime, setStartTime] = useState(item?.startTime ?? '')
  const [endTime, setEndTime] = useState(item?.endTime ?? '')
  const [specialPrice, setSpecialPrice] = useState(item?.specialPrice !== null && item?.specialPrice !== undefined ? String(item.specialPrice) : '')
  const [unitLimit, setUnitLimit] = useState(item?.unitLimit !== null && item?.unitLimit !== undefined ? String(item.unitLimit) : '')
  const [whileSuppliesLast, setWhileSuppliesLast] = useState(item?.whileSuppliesLast ?? false)
  const [rangeUntil, setRangeUntil] = useState('')

  if (!item) return null

  const rules = {
    isActive,
    startTime: startTime || null,
    endTime: endTime || null,
    specialPrice: specialPrice.trim() === '' ? null : Number(specialPrice),
    unitLimit: unitLimit.trim() === '' ? null : Number(unitLimit),
    whileSuppliesLast,
  }

  async function handleSave() {
    try {
      await updateRules.mutateAsync({ id: item!.id, rules })
      show('Reglas actualizadas.')
      onClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudieron guardar las reglas'), 'error')
    }
  }

  async function handleRemove() {
    try {
      await removeItem.mutateAsync(item!.id)
      show(`${item!.productName} quitado del día.`)
      onClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo quitar el plato'), 'error')
    }
  }

  async function handleApplyRange() {
    if (!rangeUntil || rangeUntil <= item!.planDate) return
    const dates: string[] = []
    let d = addDays(item!.planDate, 1)
    while (d <= rangeUntil) {
      dates.push(d)
      d = addDays(d, 1)
    }
    if (dates.length === 0) return
    try {
      const added = await applyRange.mutateAsync({ productId: item!.productId, dates, displayOrder: item!.displayOrder, rules })
      const skipped = dates.length - added
      show(added === 0 ? 'Ese plato ya estaba en todos esos días.' : `Aplicado a ${added} día(s) más${skipped > 0 ? ` (${skipped} ya lo tenían)` : ''}.`)
      setRangeUntil('')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo aplicar al rango'), 'error')
    }
  }

  const { weekday, day, month } = formatDayHeader(item.planDate)

  return (
    <Drawer
      open={!!item}
      onClose={onClose}
      title={item.productName}
      subtitle={`${weekday} ${day} de ${month} · ${formatMoney(item.productPrice)} precio base`}
      size="sm"
    >
      <div className="space-y-5">
        <Button variant={isActive ? 'secondary' : 'primary'} icon={Power} onClick={() => setIsActive((v) => !v)} className="w-full">
          {isActive ? 'Disponible este día' : 'Marcado agotado / inactivo'}
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Desde">{(a11y) => <Input {...a11y} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}</FormField>
          <FormField label="Hasta">{(a11y) => <Input {...a11y} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}</FormField>
        </div>

        <FormField label="Precio promocional" hint={`Vacío = precio normal (${formatMoney(item.productPrice)})`}>
          {(a11y) => (
            <Input {...a11y} type="number" step="any" min="0" value={specialPrice} onChange={(e) => setSpecialPrice(e.target.value)} placeholder={String(item.productPrice)} />
          )}
        </FormField>

        <FormField label="Límite de unidades" hint="Vacío = sin límite">
          {(a11y) => <Input {...a11y} type="number" min="1" value={unitLimit} onChange={(e) => setUnitLimit(e.target.value)} placeholder="Ej. 20" />}
        </FormField>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={whileSuppliesLast}
            onChange={(e) => setWhileSuppliesLast(e.target.checked)}
            className="size-4 rounded border-neutral-700 bg-neutral-900 text-brasa-500 focus-visible:ring-2 focus-visible:ring-brasa-500"
          />
          Disponible hasta agotar existencias
        </label>

        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void handleSave()} loading={updateRules.isPending} className="flex-1">
            Guardar cambios
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => void handleRemove()} loading={removeItem.isPending}>
            Quitar
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
            <CalendarRange size={13} aria-hidden /> Aplicar estas mismas reglas también hasta…
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              min={addDays(item.planDate, 1)}
              value={rangeUntil}
              onChange={(e) => setRangeUntil(e.target.value)}
              aria-label="Aplicar hasta la fecha"
              className="flex-1"
            />
            <Button variant="secondary" size="sm" onClick={() => void handleApplyRange()} loading={applyRange.isPending} disabled={!rangeUntil}>
              Aplicar
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  )
}
