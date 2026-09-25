import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import type { Product } from '@/modules/products/types'
import { Button } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs } from '@/shared/ui/Tabs'
import { useToast } from '@/shared/ui/Toast'
import { planItemErrorMessage } from '../lib/errors'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { CalendarDays, CalendarRange, Copy, Soup } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CatalogSidebar } from '../components/CatalogSidebar'
import { CopyMenuDialog } from '../components/CopyMenuDialog'
import { DishFormDrawer } from '../components/DishFormDrawer'
import { MonthCalendar } from '../components/MonthCalendar'
import { PlanItemRulesDrawer } from '../components/PlanItemRulesDrawer'
import { WeekCalendar } from '../components/WeekCalendar'
import { useAddMenuPlanItem, useMenuPlanRange } from '../hooks/useMenuPlan'
import { useMenuPlannerDrag } from '../hooks/useMenuPlannerDrag'
import { addDays, startOfWeek, todayStr } from '../lib/week'
import type { MenuPlanItem } from '../types'

type ViewMode = 'week' | 'month'

export function MenuPlannerPage() {
  const { can } = useActiveKitchen()
  const [view, setView] = useState<ViewMode>('week')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayStr()))
  const [monthAnchor, setMonthAnchor] = useState(todayStr())
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [dishDrawerOpen, setDishDrawerOpen] = useState(false)
  const [rulesItem, setRulesItem] = useState<MenuPlanItem | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)

  // El mes trae 35 días de margen antes/después para que las celdas del mes
  // vecino que asoman en la grilla de 6 semanas también muestren sus platos.
  const rangeStart = view === 'week' ? weekStart : startOfWeek(addDays(monthAnchor, -35))
  const rangeEnd = view === 'week' ? addDays(weekStart, 7) : addDays(monthAnchor, 70)

  const { data: items, isLoading, isError, error, refetch } = useMenuPlanRange(rangeStart, rangeEnd)
  const addItem = useAddMenuPlanItem()
  const { show } = useToast()

  const itemsByDate = useMemo(() => {
    const map: Record<string, MenuPlanItem[]> = {}
    for (const item of items ?? []) {
      ;(map[item.planDate] ??= []).push(item)
    }
    return map
  }, [items])

  const { sensors, activeDrag, handleDragStart, handleDragEnd } = useMenuPlannerDrag(itemsByDate)

  const selectedDateProductIds = useMemo(() => new Set((itemsByDate[selectedDate] ?? []).map((i) => i.productId)), [itemsByDate, selectedDate])

  async function handleQuickAdd(product: Product) {
    const dayItems = itemsByDate[selectedDate] ?? []
    if (dayItems.some((i) => i.productId === product.id)) {
      show(`${product.name} ya está en ese día.`, 'error')
      return
    }
    const nextOrder = dayItems.length ? Math.max(...dayItems.map((i) => i.displayOrder)) + 1 : 0
    try {
      await addItem.mutateAsync({ planDate: selectedDate, input: { productId: product.id, displayOrder: nextOrder } })
      show(`${product.name} agregado.`)
    } catch (err) {
      show(planItemErrorMessage(err, 'No se pudo agregar el plato.', `${product.name} ya está en ese día.`), 'error')
    }
  }

  function handleOpenWeekFromMonth(date: string) {
    setWeekStart(startOfWeek(date))
    setSelectedDate(date)
    setView('week')
  }

  let calendar
  if (isError) {
    calendar = <ErrorState error={error} onRetry={() => void refetch()} />
  } else if (isLoading) {
    calendar = <LoadingState variant="cards" rows={2} cols={7} />
  } else if (view === 'week') {
    calendar = (
      <WeekCalendar
        weekStart={weekStart}
        onWeekStartChange={setWeekStart}
        itemsByDate={itemsByDate}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onOpenItem={can('menus.edit') ? setRulesItem : () => {}}
      />
    )
  } else {
    calendar = (
      <MonthCalendar
        monthAnchor={monthAnchor}
        onMonthAnchorChange={setMonthAnchor}
        itemsByDate={itemsByDate}
        onOpenWeek={handleOpenWeekFromMonth}
        onOpenItem={can('menus.edit') ? setRulesItem : () => {}}
      />
    )
  }

  const activeDishName = activeDrag?.kind === 'catalog' ? activeDrag.productName : activeDrag?.kind === 'planItem' ? activeDrag.item.productName : null

  return (
    <DndContext sensors={can('menus.edit') ? sensors : []} onDragStart={handleDragStart} onDragEnd={(e) => void handleDragEnd(e)}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <PageHeader
          title="Planificador de Menús"
          description="Platos, calendario y disponibilidad en un solo lugar."
          icon={Soup}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Tabs
                value={view}
                onChange={setView}
                items={[
                  { value: 'week', label: 'Semana', icon: CalendarDays },
                  { value: 'month', label: 'Mes', icon: CalendarRange },
                ]}
              />
              {can('menus.manage') && (
                <Button variant="secondary" icon={Copy} onClick={() => setCopyOpen(true)}>
                  Copiar
                </Button>
              )}
            </div>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          <div className="shrink-0 md:w-72 lg:w-80">
            <CatalogSidebar
              selectedDateProductIds={selectedDateProductIds}
              onQuickAdd={(product) => void handleQuickAdd(product)}
              onEditDish={(product) => {
                setEditingProduct(product)
                setDishDrawerOpen(true)
              }}
              onCreateDish={() => {
                setEditingProduct(null)
                setDishDrawerOpen(true)
              }}
            />
          </div>

          <div className="min-h-0 min-w-0 flex-1">{calendar}</div>
        </div>
      </div>

      <DragOverlay>
        {activeDishName && (
          <div className="shadow-float rounded-lg border border-brasa-500/60 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-100">{activeDishName}</div>
        )}
      </DragOverlay>

      <DishFormDrawer
        key={dishDrawerOpen ? (editingProduct?.id ?? 'new') : 'closed'}
        product={editingProduct}
        open={dishDrawerOpen}
        onClose={() => setDishDrawerOpen(false)}
      />
      <PlanItemRulesDrawer key={rulesItem?.id ?? 'closed'} item={rulesItem} onClose={() => setRulesItem(null)} />
      <CopyMenuDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        defaultDate={selectedDate}
        onCopied={(targetDate) => {
          setWeekStart(startOfWeek(targetDate))
          setSelectedDate(targetDate)
          setView('week')
        }}
      />
    </DndContext>
  )
}
