import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useState } from 'react'
import { planItemErrorMessage } from '../lib/errors'
import { formatDayHeader } from '../lib/week'
import type { MenuPlanItem } from '../types'
import { useAddMenuPlanItem, useMoveMenuPlanItem, useReorderMenuPlanDay, type PlanProductSnapshot } from './useMenuPlan'

export type MenuPlanDragData =
  | { kind: 'catalog'; productId: string; productName: string; product: PlanProductSnapshot }
  | { kind: 'planItem'; item: MenuPlanItem }

export function shortDateLabel(date: string) {
  const { weekday, day, month } = formatDayHeader(date)
  return `${weekday} ${day} ${month}`
}

function arrayMoveSimple<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr]
  const [moved] = copy.splice(from, 1)
  if (moved !== undefined) copy.splice(to, 0, moved)
  return copy
}

const nextOrder = (dayItems: MenuPlanItem[]) => (dayItems.length ? Math.max(...dayItems.map((i) => i.displayOrder)) + 1 : 0)

/**
 * Drag & drop of the planner (ADR 0018): same mutations as the "+" button
 * and the rules drawer, now optimistic — a dish dropped on a day is there at
 * once, the catalog card stays where it was, and a failure undoes itself.
 *   catalog -> day        adds the dish to that date
 *   planItem -> other day moves it (not onto a day that already has it)
 *   planItem -> item of the same day  reorders
 * Days that already have the dragged dish do not accept it (see DayCell).
 */
export function useMenuPlannerDrag(itemsByDate: Record<string, MenuPlanItem[]>, onAdded?: (productId: string, date: string) => void) {
  const [activeDrag, setActiveDrag] = useState<MenuPlanDragData | null>(null)
  const addItem = useAddMenuPlanItem()
  const moveItem = useMoveMenuPlanItem()
  const reorderDay = useReorderMenuPlanDay()
  const { show } = useToast()

  // Mouse: a small movement starts the drag. Touch: a short press, so scrolling the catalog never drags.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag((event.active.data.current as MenuPlanDragData | undefined) ?? null)
  }

  function findItemDate(id: string): string | null {
    for (const [date, items] of Object.entries(itemsByDate)) {
      if (items.some((i) => i.id === id)) return date
    }
    return null
  }

  /** The unique (plan_date, product_id) of the table is the real rule; this keeps the message human. */
  const alreadyThere = (date: string, productId: string) => (itemsByDate[date] ?? []).some((i) => i.productId === productId)

  async function addToDay(productId: string, product: PlanProductSnapshot, date: string) {
    if (alreadyThere(date, productId)) {
      show(`${product.productName} ya está en ${shortDateLabel(date)}.`, 'info')
      return
    }
    onAdded?.(productId, date)
    try {
      await addItem.mutateAsync({ planDate: date, input: { productId, displayOrder: nextOrder(itemsByDate[date] ?? []) }, product })
    } catch (err) {
      show(planItemErrorMessage(err, 'No se pudo agregar el plato.', `${product.productName} ya está en ${shortDateLabel(date)}.`), 'error')
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const data = activeDrag
    setActiveDrag(null)
    const { over } = event
    if (!over || !data) return

    const overId = String(over.id)
    const targetDate = overId.startsWith('day:') ? overId.slice(4) : findItemDate(overId)
    if (!targetDate) return

    if (data.kind === 'catalog') {
      await addToDay(data.productId, data.product, targetDate)
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

    if (alreadyThere(targetDate, item.productId)) {
      show(`${item.productName} ya está en ${shortDateLabel(targetDate)}.`, 'info')
      return
    }
    try {
      await moveItem.mutateAsync({ id: item.id, planDate: targetDate, displayOrder: nextOrder(itemsByDate[targetDate] ?? []) })
    } catch (err) {
      show(planItemErrorMessage(err, 'No se pudo mover el plato.', `${item.productName} ya está en ${shortDateLabel(targetDate)}.`), 'error')
    }
  }

  /** The dish being dragged (for days to say whether they accept it). */
  const draggedProductId = activeDrag?.kind === 'catalog' ? activeDrag.productId : activeDrag?.kind === 'planItem' ? activeDrag.item.productId : null

  return { sensors, activeDrag, draggedProductId, handleDragStart, handleDragEnd, addToDay }
}
