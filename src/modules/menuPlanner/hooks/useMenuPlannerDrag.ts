import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useState } from 'react'
import { planItemErrorMessage } from '../lib/errors'
import { formatDayHeader } from '../lib/week'
import type { MenuPlanItem } from '../types'
import { useAddMenuPlanItem, useMoveMenuPlanItem, useReorderMenuPlanDay } from './useMenuPlan'

export type MenuPlanDragData = { kind: 'catalog'; productId: string; productName: string } | { kind: 'planItem'; item: MenuPlanItem }

function shortDateLabel(date: string) {
  const { weekday, day, month } = formatDayHeader(date)
  return `${weekday} ${day} ${month}`
}

function arrayMoveSimple<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr]
  const [moved] = copy.splice(from, 1)
  if (moved !== undefined) copy.splice(to, 0, moved)
  return copy
}

/**
 * Encapsula el drag & drop del planificador — mismo patrón que
 * useKanbanDragDrop de Cocina: solo actúa en dragEnd (sin preview optimista
 * propia), y siempre llama a las mismas mutaciones que ya usan los botones
 * "+"/quitar/reglas, nunca lógica duplicada. Tres gestos:
 *   catalog -> day        agrega el plato a esa fecha
 *   planItem -> otro día  mueve la fecha (falla si el plato ya está ese día)
 *   planItem -> otro item del MISMO día   reordena
 */
export function useMenuPlannerDrag(itemsByDate: Record<string, MenuPlanItem[]>) {
  const [activeDrag, setActiveDrag] = useState<MenuPlanDragData | null>(null)
  const addItem = useAddMenuPlanItem()
  const moveItem = useMoveMenuPlanItem()
  const reorderDay = useReorderMenuPlanDay()
  const { show } = useToast()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag((event.active.data.current as MenuPlanDragData | undefined) ?? null)
  }

  function findItemDate(id: string): string | null {
    for (const [date, items] of Object.entries(itemsByDate)) {
      if (items.some((i) => i.id === id)) return date
    }
    return null
  }

  async function handleDragEnd(event: DragEndEvent) {
    const data = activeDrag
    setActiveDrag(null)
    const { over } = event
    if (!over || !data) return

    const overId = String(over.id)
    const targetDate = overId.startsWith('day:') ? overId.slice(4) : findItemDate(overId)
    if (!targetDate) return

    // El unique (plan_date, product_id) de la tabla es la regla real; acá se
    // valida antes para no llegar a la base con algo que sabemos que falla y
    // devolver un mensaje humano en vez de "duplicate key value violates…".
    const alreadyThere = (productId: string) => (itemsByDate[targetDate] ?? []).some((i) => i.productId === productId)

    if (data.kind === 'catalog') {
      if (alreadyThere(data.productId)) {
        show(`${data.productName} ya está en ${shortDateLabel(targetDate)}.`, 'error')
        return
      }
      const dayItems = itemsByDate[targetDate] ?? []
      const nextOrder = dayItems.length ? Math.max(...dayItems.map((i) => i.displayOrder)) + 1 : 0
      try {
        await addItem.mutateAsync({ planDate: targetDate, input: { productId: data.productId, displayOrder: nextOrder } })
        show(`${data.productName} agregado a ${shortDateLabel(targetDate)}.`)
      } catch (err) {
        show(planItemErrorMessage(err, 'No se pudo agregar el plato.', `${data.productName} ya está en ${shortDateLabel(targetDate)}.`), 'error')
      }
      return
    }

    const { item } = data
    if (item.planDate === targetDate) {
      if (overId === item.id || overId.startsWith('day:')) return
      const dayItems = [...(itemsByDate[targetDate] ?? [])].sort((a, b) => a.displayOrder - b.displayOrder)
      const fromIndex = dayItems.findIndex((i) => i.id === item.id)
      const toIndex = dayItems.findIndex((i) => i.id === overId)
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return
      const reordered = arrayMoveSimple(dayItems, fromIndex, toIndex)
      try {
        await reorderDay.mutateAsync(reordered.map((it, idx) => ({ id: it.id, displayOrder: idx })))
      } catch (err) {
        show(getErrorMessage(err, 'No se pudo reordenar'), 'error')
      }
      return
    }

    if (alreadyThere(item.productId)) {
      show(`${item.productName} ya está en ${shortDateLabel(targetDate)}.`, 'error')
      return
    }
    const dayItems = itemsByDate[targetDate] ?? []
    const nextOrder = dayItems.length ? Math.max(...dayItems.map((i) => i.displayOrder)) + 1 : 0
    try {
      await moveItem.mutateAsync({ id: item.id, planDate: targetDate, displayOrder: nextOrder })
      show(`${item.productName} movido a ${shortDateLabel(targetDate)}.`)
    } catch (err) {
      show(planItemErrorMessage(err, 'No se pudo mover el plato.', `${item.productName} ya está en ${shortDateLabel(targetDate)}.`), 'error')
    }
  }

  return { sensors, activeDrag, handleDragStart, handleDragEnd }
}
