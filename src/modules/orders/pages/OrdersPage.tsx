import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Page } from '@/shared/ui/Page'
import { useNow } from '@/shared/hooks/useNow'
import { Button, IconButton } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { Menu, type MenuItem } from '@/shared/ui/Menu'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { Tooltip } from '@/shared/ui/Tooltip'
import { Bell, Bike, ClipboardList, Kanban, List, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BoardActionsContext, type BoardActions } from '../board/boardActions'
import { CancelOrderDialog, ConfirmOrderDialog, DispatchDialog } from '../board/BoardDialogs'
import { OrderBoard } from '../board/OrderBoard'
import { NewOrderDrawer } from '../components/NewOrderDrawer'
import { OrderDetailDrawer } from '../components/OrderDetailDrawer'
import { RidersDrawer } from '../components/RidersDrawer'
import { useNewOrderAlert } from '../hooks/useNewOrderAlert'
import { useDeliveredTodayCount, useLiveOrders } from '../hooks/useOrders'
import { ACTION_DENIED_REASON, canPerform } from '../lib/permissions'
import type { Order, OrderStatus } from '../types'
import { DispatchView } from '../views/DispatchView'
import { OrderListView } from '../views/OrderListView'

type OrdersView = 'board' | 'list' | 'dispatch'

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-800/60 bg-neutral-900/60 px-3.5 py-2.5">
      <p className="text-xl leading-none font-semibold tabular-nums text-neutral-50">{value}</p>
      <p className="mt-1.5 truncate text-xs text-neutral-500">{label}</p>
    </div>
  )
}

/** Typing in a field must never trigger a shortcut. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/**
 * Pedidos — the operational centre (ADR 0020). One live list of orders feeds
 * three views: Tablero (the whole flow, to confirm, move and cancel), Lista
 * (every order, searchable) and Despacho (ready and on their way). The order
 * detail (/orders/:id) ties customer, dishes, stock, kitchen and delivery.
 * Shortcuts: N new order, / search.
 */
export function OrdersPage() {
  const { can, path } = useActiveKitchen()
  const navigate = useNavigate()
  const location = useLocation()
  const { orderId } = useParams<{ orderId?: string }>()
  const [params, setParams] = useSearchParams()
  const now = useNow()

  const canSeeOrders = can('orders.view')
  const canSeeDispatch = can('dispatch.view') || can('dispatch.assign')
  const views = useMemo<TabItem<OrdersView>[]>(
    () => [
      ...(canSeeOrders
        ? [
            { value: 'board' as const, label: 'Tablero', icon: Kanban },
            { value: 'list' as const, label: 'Lista', icon: List },
          ]
        : []),
      ...(canSeeDispatch ? [{ value: 'dispatch' as const, label: 'Despacho', icon: Bike }] : []),
    ],
    [canSeeOrders, canSeeDispatch],
  )
  const requested = params.get('view') as OrdersView | null
  const view: OrdersView = views.find((v) => v.value === requested)?.value ?? views[0]?.value ?? 'dispatch'

  const { data: live, isLoading } = useLiveOrders(view !== 'list')
  const { data: deliveredToday } = useDeliveredTodayCount(view === 'board')
  const canCreate = canPerform(can, 'create')

  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [ridersOpen, setRidersOpen] = useState(false)
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null)
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null)
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)
  const listSearchRef = useRef<HTMLInputElement>(null)

  // A new WhatsApp order sounds and glows on the board until someone opens it.
  const drafts = useMemo(() => live?.filter((o) => o.status === 'NUEVO'), [live])
  const { newIds, acknowledge, soundEnabled, toggleSound } = useNewOrderAlert(drafts)

  const sorted = useMemo(
    () => (live ? [...live].sort((a, b) => b.priority - a.priority || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) : undefined),
    [live],
  )
  const kpis = useMemo(() => {
    const count = (status: OrderStatus) => (live ?? []).filter((o) => o.status === status).length
    return { nuevo: count('NUEVO'), cola: count('CONFIRMADO'), preparando: count('EN_PREPARACION'), listo: count('LISTO'), ruta: count('DESPACHADO') }
  }, [live])

  const setView = (next: OrdersView) => setParams(next === views[0]?.value ? {} : { view: next }, { replace: true })

  const openDetail = useCallback((order: Pick<Order, 'id'>) => navigate({ pathname: path(`/orders/${order.id}`), search: location.search }), [navigate, path, location.search])
  const closeDetail = () => navigate({ pathname: path('/orders'), search: location.search })

  const boardActions = useMemo<BoardActions>(
    () => ({ can, density: 'normal', openDetail, requestConfirm: setConfirmOrder, requestDispatch: setDispatchOrder, requestCancel: setCancelOrder }),
    [can, openDetail],
  )

  // N = new order, / = search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (e.key === 'n' || e.key === 'N') {
        if (canCreate && canSeeOrders) {
          e.preventDefault()
          setNewOrderOpen(true)
        }
      } else if (e.key === '/') {
        e.preventDefault()
        if (view === 'list') listSearchRef.current?.focus()
        else if (view === 'board') setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canCreate, canSeeOrders, view])

  const menuItems: MenuItem[] = [
    { label: 'Sonido de pedidos nuevos', icon: Bell, checked: soundEnabled, onSelect: toggleSound },
    ...(canSeeDispatch ? [{ label: 'Domiciliarios', icon: Bike, onSelect: () => setRidersOpen(true), separated: true }] : []),
  ]

  return (
    <BoardActionsContext.Provider value={boardActions}>
      <Page variant="board">
        <div className="shrink-0 space-y-4">
          <PageHeader
            title="Pedidos"
            icon={ClipboardList}
            description={view === 'dispatch' && !canSeeOrders ? 'Tus entregas asignadas.' : 'Del pedido a la entrega: cada vista es el mismo pedido.'}
            actions={
              <>
                {views.length > 1 && <Tabs value={view} onChange={setView} items={views} />}
                {view === 'board' &&
                  (searchOpen ? (
                    <div className="relative">
                      <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" aria-hidden />
                      <Input
                        type="search"
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setSearch('')
                            setSearchOpen(false)
                          }
                        }}
                        placeholder="# pedido o cliente"
                        aria-label="Buscar en el tablero"
                        className="!mt-0 h-10 w-52 rounded-full !py-0 pr-8 pl-8"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('')
                          setSearchOpen(false)
                        }}
                        aria-label="Cerrar búsqueda"
                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-neutral-500 hover:text-neutral-200"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <IconButton icon={Search} aria-label="Buscar pedido (/)" onClick={() => setSearchOpen(true)} />
                  ))}
                <Menu
                  items={menuItems}
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
                {canSeeOrders && (
                  <Tooltip label={canCreate ? 'Crear un pedido nuevo (N)' : ACTION_DENIED_REASON.create} side="bottom">
                    <Button variant="primary" icon={Plus} onClick={() => setNewOrderOpen(true)} disabled={!canCreate}>
                      Nuevo pedido
                    </Button>
                  </Tooltip>
                )}
              </>
            }
          />

          {view === 'board' && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Kpi label="Por confirmar" value={kpis.nuevo} />
              <Kpi label="En cola" value={kpis.cola} />
              <Kpi label="Preparando" value={kpis.preparando} />
              <Kpi label="Listos" value={kpis.listo} />
              <Kpi label="En ruta" value={kpis.ruta} />
              <Kpi label="Entregados hoy" value={deliveredToday ?? 0} />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'board' && <OrderBoard tickets={sorted} isLoading={isLoading} now={now} newIds={newIds} onAcknowledge={acknowledge} search={search} />}
          {view === 'list' && <OrderListView ref={listSearchRef} onOpen={openDetail} />}
          {view === 'dispatch' && <DispatchView orders={sorted} isLoading={isLoading} now={now} />}
        </div>
      </Page>

      {newOrderOpen && <NewOrderDrawer open onClose={() => setNewOrderOpen(false)} />}
      <RidersDrawer open={ridersOpen} onClose={() => setRidersOpen(false)} canManage={can('dispatch.riders')} />
      <OrderDetailDrawer orderId={orderId ?? null} onClose={closeDetail} />
      {confirmOrder && <ConfirmOrderDialog ticket={confirmOrder} onClose={() => setConfirmOrder(null)} />}
      {dispatchOrder && <DispatchDialog ticket={dispatchOrder} onClose={() => setDispatchOrder(null)} />}
      {cancelOrder && <CancelOrderDialog ticket={cancelOrder} onClose={() => setCancelOrder(null)} />}
    </BoardActionsContext.Provider>
  )
}
