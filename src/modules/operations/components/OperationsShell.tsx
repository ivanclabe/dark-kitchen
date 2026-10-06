import { BoardActionsContext, type BoardActions } from '@/modules/orders/board/boardActions'
import { OrderDetailDrawer } from '@/modules/orders/components/OrderDetailDrawer'
import type { FlowAction } from '@/modules/orders/lib/permissions'
import { ACTION_DENIED_REASON, canPerform } from '@/modules/orders/lib/permissions'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button, IconButton } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { Menu, type MenuItem } from '@/shared/ui/Menu'
import { Page } from '@/shared/ui/Page'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { Tooltip } from '@/shared/ui/Tooltip'
import { Activity, Bike, ChefHat, Kanban, List, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useOperations } from '../lib/operationsContext'
import { OPERATIONS_VIEW_LABEL, type OperationsView } from '../lib/views'

/** The help center article of each view (ADR 0034). */
const OPERATIONS_HELP: Record<OperationsView, string> = { board: 'operations-center', kitchen: 'kitchen-view', dispatch: 'dispatch-deliver', list: 'search-orders' }
const VIEW_ICON: Record<OperationsView, TabItem<OperationsView>['icon']> = { board: Kanban, kitchen: ChefHat, dispatch: Bike, list: List }

/**
 * The frame every view of the Centro de operaciones shares (ADR 0031): one
 * header (views, search, menu, «Nuevo pedido»), the figures, the order open
 * on top. The view brings its own figures, tools and body.
 */
export function OperationsShell({
  description,
  actions,
  menuItems = [],
  figures,
  below,
  searchable = false,
  scope,
  density = 'normal',
  children,
}: {
  description?: ReactNode
  actions?: ReactNode
  menuItems?: MenuItem[]
  figures?: ReactNode
  /** Under the figures (Cocina: the AI line). */
  below?: ReactNode
  /** The board-like views filter what is loaded by number or customer. */
  searchable?: boolean
  /** The actions this view offers (Cocina: preparation, priority and cancel). */
  scope?: ReadonlySet<FlowAction>
  density?: BoardActions['density']
  children: ReactNode
}) {
  const { can } = useActiveKitchen()
  const ops = useOperations()
  const { searchOpen, setSearchOpen } = ops
  const canSeeOrders = can('orders.view')
  const canCreate = canPerform(can, 'create')

  const board = useMemo<BoardActions>(
    () => ({
      can,
      density,
      scope,
      openDetail: ops.openDetail,
      requestConfirm: ops.requestConfirm,
      requestDispatch: ops.requestDispatch,
      requestCancel: ops.requestCancel,
    }),
    [can, density, scope, ops.openDetail, ops.requestConfirm, ops.requestDispatch, ops.requestCancel],
  )

  const tabs = ops.views.map((v) => ({ value: v, label: OPERATIONS_VIEW_LABEL[v], icon: VIEW_ICON[v] }))
  const menu: MenuItem[] = [
    ...menuItems,
    ...(can('dispatch.view') || can('dispatch.assign') ? [{ label: 'Domiciliarios', icon: Bike, onSelect: ops.openRiders, separated: menuItems.length > 0 }] : []),
  ]

  function closeSearch() {
    ops.setSearch('')
    setSearchOpen(false)
  }

  return (
    <BoardActionsContext.Provider value={board}>
      <Page variant="board">
        <div className="shrink-0 space-y-4">
          <PageHeader
            help={OPERATIONS_HELP[ops.view]}
            title="Centro de operaciones"
            icon={Activity}
            description={description}
            actions={
              <>
                {tabs.length > 1 && <Tabs value={ops.view} onChange={(v) => ops.setView(v)} items={tabs} />}
                {searchable &&
                  (searchOpen ? (
                    <div className="relative">
                      <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
                      <Input
                        type="search"
                        autoFocus
                        value={ops.search}
                        onChange={(e) => ops.setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                        placeholder="# pedido o cliente"
                        aria-label="Buscar pedido"
                        className="!mt-0 h-10 w-52 rounded-full !py-0 pr-8 pl-8"
                      />
                      <button type="button" onClick={closeSearch} aria-label="Cerrar búsqueda" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-neutral-500 hover:text-neutral-200">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <IconButton icon={Search} aria-label="Buscar pedido (/)" onClick={() => setSearchOpen(true)} />
                  ))}
                {actions}
                {menu.length > 0 && (
                  <Menu
                    items={menu}
                    trigger={(props) => (
                      <button
                        type="button"
                        {...props}
                        aria-label="Más opciones"
                        title="Más opciones"
                        className="inline-flex size-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </button>
                    )}
                  />
                )}
                {canSeeOrders && (
                  <Tooltip label={canCreate ? 'Crear un pedido nuevo (N)' : ACTION_DENIED_REASON.create} side="bottom">
                    <Button variant="primary" icon={Plus} onClick={ops.openNewOrder} disabled={!canCreate}>
                      Nuevo pedido
                    </Button>
                  </Tooltip>
                )}
              </>
            }
          />
          {figures}
          {below}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </Page>
      <OrderDetailDrawer orderId={ops.detailOrderId} onClose={ops.closeDetail} />
    </BoardActionsContext.Provider>
  )
}
