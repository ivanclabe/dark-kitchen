import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Page } from '@/shared/ui/Page'
import type { Product } from '@/modules/products/types'
import { Button, buttonClass } from '@/shared/ui/Button'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs } from '@/shared/ui/Tabs'
import { useToast } from '@/shared/ui/Toast'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { CalendarDays, CalendarRange, Copy, Layers, Soup } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CatalogSidebar } from '../components/CatalogSidebar'
import { CopyMenuDialog } from '../components/CopyMenuDialog'
import { DishFormDrawer } from '../components/DishFormDrawer'
import { MonthCalendar } from '../components/MonthCalendar'
import { PlanItemRulesDrawer } from '../components/PlanItemRulesDrawer'
import { WeekCalendar } from '../components/WeekCalendar'
import { ProductThumb } from '@/modules/products/components/ProductImage'
import { useAddMenuPlanItem, useMenuPlanRange, useRemoveMenuPlanItem } from '../hooks/useMenuPlan'
import { shortDateLabel, useMenuPlannerDrag } from '../hooks/useMenuPlannerDrag'
import type { PlanDragInfo } from '../lib/dragRules'
import { addDays, startOfWeek, todayStr } from '../lib/week'
import type { MenuPlanItem } from '../types'
import { useProducts } from '@/modules/products/hooks/useProducts'
import { useSearchParams } from 'react-router-dom'

type ViewMode = 'week' | 'month'

export function MenuPlannerPage() {
  const { can, canShared } = useActiveKitchen()
  const [view, setView] = useState<ViewMode>('week')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayStr()))
  const [monthAnchor, setMonthAnchor] = useState(todayStr())
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [dishDrawerOpen, setDishDrawerOpen] = useState(false)
  const [rulesItem, setRulesItem] = useState<MenuPlanItem | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)

  // ADR 0046: ?plato=<id> opens that dish to edit (from Quanela Consumer: «sin foto», «sin descripción»).
  const [params, setParams] = useSearchParams()
  const linkedDishId = params.get('plato')
  const { data: allProducts } = useProducts(Boolean(linkedDishId))
  const [openedLink, setOpenedLink] = useState<string | null>(null)
  if (linkedDishId && allProducts && openedLink !== linkedDishId) {
    setOpenedLink(linkedDishId)
    const dish = allProducts.find((p) => p.id === linkedDishId)
    if (dish) {
      setEditingProduct(dish)
      setDishDrawerOpen(true)
    }
  }
  // Once opened, the address goes back to the plain catalog (a reload does not reopen it).
  useEffect(() => {
    if (!openedLink) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('plato')
        return next
      },
      { replace: true },
    )
  }, [openedLink, setParams])

  // El mes trae 35 días de margen antes/después para que las celdas del mes
  // vecino que asoman en la grilla de 6 semanas también muestren sus platos.
  const rangeStart = view === 'week' ? weekStart : startOfWeek(addDays(monthAnchor, -35))
  const rangeEnd = view === 'week' ? addDays(weekStart, 7) : addDays(monthAnchor, 70)

  const { data: items, isLoading, isError, error, refetch } = useMenuPlanRange(rangeStart, rangeEnd)
  const addItem = useAddMenuPlanItem()
  const removeItem = useRemoveMenuPlanItem()
  const { show } = useToast()
  const [justAddedProductId, setJustAddedProductId] = useState<string | null>(null)
  const justAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (justAddedTimer.current) clearTimeout(justAddedTimer.current)
  }, [])

  /** Brief "Agregado" on the catalog card, so it is clear the dish landed while the card stays in place. */
  function flashAdded(productId: string) {
    setJustAddedProductId(productId)
    if (justAddedTimer.current) clearTimeout(justAddedTimer.current)
    justAddedTimer.current = setTimeout(() => setJustAddedProductId(null), 1400)
  }

  const itemsByDate = useMemo(() => {
    const map: Record<string, MenuPlanItem[]> = {}
    for (const item of items ?? []) {
      ;(map[item.planDate] ??= []).push(item)
    }
    return map
  }, [items])

  const { sensors, activeDrag, draggedProductId, handleDragStart, handleDragEnd, addToDay } = useMenuPlannerDrag(itemsByDate, (productId) => flashAdded(productId))
  const drag: PlanDragInfo = { productId: draggedProductId, sourceDate: activeDrag?.kind === 'planItem' ? activeDrag.item.planDate : null }

  /** Where each dish already is (in the loaded range), for the catalog cards. */
  const datesByProduct = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const item of items ?? []) {
      if (!map.has(item.productId)) map.set(item.productId, new Set())
      map.get(item.productId)!.add(item.planDate)
    }
    return map
  }, [items])
  const visibleWeekStart = view === 'week' ? weekStart : startOfWeek(selectedDate)
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(visibleWeekStart, i)), [visibleWeekStart])

  function handleQuickAdd(product: Product) {
    void addToDay(
      product.id,
      { productName: product.name, productPrice: product.price, productCategory: product.categoryName, productActive: product.active, productImagePath: product.imagePath },
      selectedDate,
    )
  }

  /** Off the day at once, with a few seconds to undo (same rules come back). */
  function handleRemove(item: MenuPlanItem) {
    removeItem.mutate(item.id, {
      onError: () => show(`No se pudo quitar ${item.productName}.`, 'error'),
    })
    show(`${item.productName} quitado de ${shortDateLabel(item.planDate)}.`, 'info', {
      action: {
        label: 'Deshacer',
        onClick: () =>
          addItem.mutate({
            planDate: item.planDate,
            input: {
              productId: item.productId,
              displayOrder: item.displayOrder,
              isActive: item.isActive,
              startTime: item.startTime,
              endTime: item.endTime,
              specialPrice: item.specialPrice,
              unitLimit: item.unitLimit,
              whileSuppliesLast: item.whileSuppliesLast,
            },
            product: item,
          }),
      },
    })
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
        onRemoveItem={can('menus.edit') ? handleRemove : undefined}
        drag={drag}
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
        onRemoveItem={can('menus.edit') ? handleRemove : undefined}
        drag={drag}
      />
    )
  }

  const activeDish =
    activeDrag?.kind === 'catalog'
      ? { name: activeDrag.productName, path: activeDrag.product.productImagePath, category: activeDrag.product.productCategory }
      : activeDrag?.kind === 'planItem'
        ? { name: activeDrag.item.productName, path: activeDrag.item.productImagePath, category: activeDrag.item.productCategory }
        : null

  return (
    <DndContext sensors={can('menus.edit') ? sensors : []} onDragStart={handleDragStart} onDragEnd={(e) => void handleDragEnd(e)}>
      <Page variant="board">
        <PageHeader help="dishes-and-menu"
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
              {canShared('master_menus.manage') && (
                <Link to="/menu-planner?view=shared" className={buttonClass({ variant: 'ghost' })}>
                  <Layers size={16} aria-hidden /> Platos compartidos
                </Link>
              )}
            </div>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          <div className="shrink-0 md:w-72 lg:w-80">
            <CatalogSidebar
              weekDates={weekDates}
              datesByProduct={datesByProduct}
              selectedDate={selectedDate}
              justAddedProductId={justAddedProductId}
              onQuickAdd={handleQuickAdd}
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
      </Page>

      {/* No animation back to the origin: the dish lands where it is dropped (ADR 0018). */}
      <DragOverlay dropAnimation={null}>
        {activeDish && (
          <div className="shadow-float flex items-center gap-2 rounded-lg border border-brasa-500/60 bg-neutral-900 py-1 pr-2.5 pl-1 text-xs font-medium text-neutral-100">
            <ProductThumb name={activeDish.name} path={activeDish.path} toneSeed={activeDish.category} size="xs" />
            {activeDish.name}
          </div>
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
