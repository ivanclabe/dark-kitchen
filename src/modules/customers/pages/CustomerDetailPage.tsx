import { RegisterPaymentModal } from '@/modules/cartera/components/RegisterPaymentModal'
import { formatPhone } from '@/shared/utils/phone'
import { Page } from '@/shared/ui/Page'
import { useCustomerReceivables, usePaymentsByCustomer } from '@/modules/cartera/hooks/useReceivables'
import { useOrderSearch } from '@/modules/orders/hooks/useOrders'
import { NewOrderDrawer } from '@/modules/orders/components/NewOrderDrawer'
import { OrderPeekDrawer } from '@/modules/orders/components/OrderPeekDrawer'
import { OrderStatusBadge } from '@/modules/orders/lib/orderStatus'
import { Section } from '@/shared/ui/Section'
import { SubNav } from '@/shared/ui/SubNav'
import { useBackTarget } from '@/shared/hooks/useBackTarget'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { KpiStrip, type Kpi } from '@/shared/ui/KpiStrip'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { formatDate, formatDateTime, formatMoney } from '@/shared/utils/format'
import { Banknote, ChevronLeft, ChevronRight, Pencil, Plus, Receipt, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { CustomerFormModal } from '../components/CreateCustomerModal'
import { ActivityBadge, BalanceCell } from '../components/CustomerTable'
import { useCustomerDetail } from '../hooks/useCustomers'
import { relativeDay } from '../lib/dates'
import type { CustomerDetail } from '../types'

type Tab = 'orders' | 'account' | 'info'
const ORDERS_PAGE = 20

/** Pedidos: the customer's orders, 20 per page; one opens in a drawer over this page (the context stays). */
function CustomerOrders({ customerId, onOpen }: { customerId: string; onOpen: (orderId: string) => void }) {
  const [page, setPage] = useState(0)
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useOrderSearch({ customerId, limit: ORDERS_PAGE, offset: page * ORDERS_PAGE })
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isLoading) return <LoadingState variant="block" />
  if (!data?.orders.length && page === 0) return <EmptyState icon={Receipt} title="Sin pedidos todavía" description="Los pedidos de este cliente aparecerán aquí." compact />
  return (
    <div className={isPlaceholderData ? 'space-y-3 opacity-60' : 'space-y-3'}>
      <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60">
        {data?.orders.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => onOpen(o.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-900/50">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                  Pedido #{o.orderNumber} <OrderStatusBadge status={o.status} size="sm" />
                </span>
                <span className="block text-xs text-neutral-500">{formatDateTime(o.createdAt)}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-neutral-200">{formatMoney(o.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      {(page > 0 || data?.hasMore) && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            Anterior
          </Button>
          <span className="text-sm tabular-nums text-neutral-400">Página {page + 1}</span>
          <Button variant="secondary" size="sm" iconRight={ChevronRight} onClick={() => setPage((p) => p + 1)} disabled={!data?.hasMore}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  )
}

/** Cuenta: the balance, the orders that still owe (with «Registrar pago») and the payments received. */
function CustomerAccount({ customer, onOpen }: { customer: CustomerDetail; onOpen: (orderId: string) => void }) {
  const { can } = useActiveKitchen()
  const receivables = useCustomerReceivables(customer.id)
  const payments = usePaymentsByCustomer(customer.id)
  const [paying, setPaying] = useState<string | null>(null)
  const owing = (receivables.data ?? []).filter((r) => r.balance > 0)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <Section title="Pedidos con saldo" description={owing.length ? `${formatMoney(customer.balance ?? 0)} pendiente en ${owing.length} ${owing.length === 1 ? 'pedido' : 'pedidos'}.` : undefined}>
        {receivables.isLoading ? (
          <LoadingState variant="block" />
        ) : receivables.isError ? (
          <ErrorState error={receivables.error} onRetry={() => void receivables.refetch()} />
        ) : owing.length === 0 ? (
          <p className="text-sm text-neutral-500">Este cliente no debe nada.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60">
            {owing.map((r) => (
              <li key={r.orderId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <button type="button" onClick={() => onOpen(r.orderId)} className="min-w-0 text-left">
                  <span className="block text-sm font-medium text-neutral-100 hover:underline">Pedido #{r.orderNumber}</span>
                  <span className="block text-xs text-neutral-500">
                    {formatDate(r.createdAt)} · total {formatMoney(r.total)}
                    {r.dueDate && ` · vence ${formatDate(r.dueDate)}`}
                  </span>
                </button>
                <span className="flex items-center gap-3">
                  <BalanceCell balance={r.balance} overdue={r.dueDate && r.dueDate < today ? r.balance : 0} />
                  {can('receivables.collect') && (
                    <Button variant="secondary" size="sm" icon={Banknote} onClick={() => setPaying(r.orderId)}>
                      Registrar pago
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Pagos recibidos">
        {payments.isLoading ? (
          <LoadingState variant="block" />
        ) : !payments.data?.length ? (
          <p className="text-sm text-neutral-500">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 px-4">
            {payments.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="text-neutral-200">Pedido #{p.orderNumber}{p.method ? ` · ${p.method}` : ''}</span>
                  <span className="block text-xs text-neutral-500">
                    {formatDateTime(p.createdAt)}
                    {p.note ? ` · ${p.note}` : ''}
                  </span>
                </span>
                <span className={p.amount >= 0 ? 'shrink-0 font-medium tabular-nums text-emerald-400' : 'shrink-0 font-medium tabular-nums text-neutral-400'}>
                  {p.amount >= 0 ? '+' : ''}
                  {formatMoney(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <RegisterPaymentModal receivables={paying ? owing.filter((r) => r.orderId === paying) : null} onClose={() => setPaying(null)} />
    </>
  )
}

function CustomerInfo({ customer }: { customer: CustomerDetail }) {
  const rows: [string, string][] = [
    ['Nombre', customer.fullName],
    ['Teléfono', customer.phone ? formatPhone(customer.phone) : '—'],
    ['Dirección', customer.address ?? '—'],
    ['WhatsApp', customer.hasWhatsapp ? 'Vinculado: sus pedidos pueden llegar por WhatsApp' : 'No vinculado'],
    ['Cliente desde', formatDate(customer.createdAt)],
    ['Notas', customer.notes?.trim() || '—'],
  ]
  return (
    <Section title="Información" card>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className={label === 'Notas' ? 'sm:col-span-2' : undefined}>
            <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</dt>
            <dd className="mt-1 text-sm whitespace-pre-line text-neutral-200">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

/**
 * One customer (ADR 0028): who they are, their figures and three tabs —
 * Pedidos, Cuenta, Información. Everything is read for this customer only
 * (never the whole list), and an order opens over this page.
 */
export function CustomerDetailPage() {
  const { can } = useActiveKitchen()
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const { data: customer, isLoading, isError, error, refetch } = useCustomerDetail(id)
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [openOrder, setOpenOrder] = useState<string | null>(null)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const back = useBackTarget({ to: '/customers', label: 'Clientes' })
  const queryClient = useQueryClient()
  const receivables = useCustomerReceivables(id, payOpen)

  const showDebt = customer?.balance !== undefined
  const tabs: { value: Tab; label: string }[] = [
    { value: 'orders', label: 'Pedidos' },
    ...(showDebt ? [{ value: 'account' as const, label: 'Cuenta' }] : []),
    { value: 'info', label: 'Información' },
  ]
  const tab: Tab = tabs.find((t) => t.value === params.get('tab'))?.value ?? 'orders'

  if (isLoading) return <LoadingState variant="block" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!customer) {
    return (
      <Page>
        <PageHeader help="customers" title="Cliente" icon={Users} backTo={back.to} backLabel={back.label} />
        <EmptyState icon={Users} title="Cliente no encontrado" description="Puede que haya sido eliminado o el enlace esté mal." />
      </Page>
    )
  }

  const kpis: Kpi[] = [
    ...(customer.orders !== undefined
      ? ([
          { id: 'orders', label: 'Pedidos', value: String(customer.orders), change: null, goodWhen: 'neutral' },
          { id: 'total', label: 'Total comprado', value: formatMoney(customer.totalPurchased ?? 0), change: null, goodWhen: 'neutral' },
        ] satisfies Kpi[])
      : []),
    ...(showDebt
      ? ([
          {
            id: 'balance',
            label: 'Saldo pendiente',
            value: formatMoney(customer.balance ?? 0),
            change: null,
            goodWhen: 'neutral',
            hint: customer.overdue ? `${formatMoney(customer.overdue)} vencido` : undefined,
            onSelect: () => setParams({ tab: 'account' }, { replace: true, state: location.state }),
          },
        ] satisfies Kpi[])
      : []),
    ...(customer.orders !== undefined
      ? ([{ id: 'last', label: 'Último pedido', value: customer.lastOrderAt ? relativeDay(customer.lastOrderAt) : 'Nunca', change: null, goodWhen: 'neutral' }] satisfies Kpi[])
      : []),
  ]

  return (
    <Page>
      <PageHeader help="customers"
        title={customer.fullName}
        icon={Users}
        backTo={back.to}
        backLabel={back.label}
        meta={
          <>
            {customer.active !== undefined && <ActivityBadge active={customer.active} />}
            {(customer.overdue ?? 0) > 0 && (
              <Badge size="sm" tone="warning">
                Saldo vencido
              </Badge>
            )}
          </>
        }
        description={[formatPhone(customer.phone), customer.address, `Cliente desde ${formatDate(customer.createdAt)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            {can('customers.edit') && (
              <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            )}
            {can('receivables.collect') && showDebt && (
              <Button variant="secondary" icon={Banknote} onClick={() => setPayOpen(true)} disabled={(customer.balance ?? 0) <= 0}>
                Registrar pago
              </Button>
            )}
            {can('orders.create') && (
              <Button variant="primary" icon={Plus} onClick={() => setNewOrderOpen(true)}>
                Nuevo pedido
              </Button>
            )}
          </>
        }
      />

      {kpis.length > 0 && <KpiStrip items={kpis} columns={4} />}

      <SubNav label="Secciones del cliente" items={tabs} value={tab} onChange={(t) => setParams(t === 'orders' ? {} : { tab: t }, { replace: true, state: location.state })} />

      <div className="space-y-8">
        {tab === 'orders' ? (
          <CustomerOrders customerId={customer.id} onOpen={setOpenOrder} />
        ) : tab === 'account' ? (
          <CustomerAccount customer={customer} onOpen={setOpenOrder} />
        ) : (
          <CustomerInfo customer={customer} />
        )}
      </div>

      <CustomerFormModal
        open={editOpen}
        customer={{ id: customer.id, fullName: customer.fullName, phone: customer.phone, address: customer.address, notes: customer.notes }}
        onClose={() => setEditOpen(false)}
      />
      <RegisterPaymentModal receivables={payOpen ? (receivables.data?.filter((r) => r.balance > 0) ?? null) : null} onClose={() => setPayOpen(false)} />
      <OrderPeekDrawer orderId={openOrder} onClose={() => setOpenOrder(null)} />
      {/* ADR 0030: a new order for THIS customer, without leaving it. */}
      {newOrderOpen && (
        <NewOrderDrawer
          open
          initialCustomer={{ id: customer.id, fullName: customer.fullName, phone: customer.phone }}
          onClose={() => {
            setNewOrderOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['customers'] })
          }}
        />
      )}
    </Page>
  )
}
