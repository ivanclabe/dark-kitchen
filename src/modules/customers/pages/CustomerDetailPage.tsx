import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { RegisterPaymentModal } from '@/modules/cartera/components/RegisterPaymentModal'
import { usePaymentsByCustomer, useReceivables } from '@/modules/cartera/hooks/useReceivables'
import type { CustomerPayment } from '@/modules/cartera/types'
import { useOrdersByCustomer } from '@/modules/orders/hooks/useOrders'
import { OrderStatusBadge } from '@/modules/orders/lib/orderStatus'
import type { Order } from '@/modules/orders/types'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { StatCard } from '@/shared/ui/StatCard'
import { cardClass } from '@/shared/ui/formClasses'
import { formatDateTime, formatMoney, initials } from '@/shared/utils/format'
import { AlertTriangle, Banknote, MapPin, Pencil, Phone, Receipt, StickyNote, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { CustomerFormModal } from '../components/CreateCustomerModal'
import { CustomerStatusBadge } from '../components/CustomerStatusBadge'
import { useCustomers } from '../hooks/useCustomers'
import { computeCustomerBalance } from '../lib/balance'

type TimelineEntry = { date: string } & ({ kind: 'order'; order: Order } | { kind: 'payment'; payment: CustomerPayment })

export function CustomerDetailPage() {
  const { can } = useActiveKitchen()
  const { id = '' } = useParams<{ id: string }>()
  const { data: customers, isLoading: loadingCustomers } = useCustomers()
  const { data: receivables } = useReceivables()
  const { data: orders, isLoading: loadingOrders, isError: ordersError, error: ordersErrorObj, refetch: refetchOrders } = useOrdersByCustomer(id)
  const { data: payments } = usePaymentsByCustomer(id)
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const customer = customers?.find((c) => c.id === id)
  const customerReceivables = useMemo(() => (receivables ?? []).filter((r) => r.customerId === id), [receivables, id])
  const balance = computeCustomerBalance(customerReceivables)

  const timeline = useMemo<TimelineEntry[]>(() => {
    const orderEntries: TimelineEntry[] = (orders ?? []).map((order) => ({ kind: 'order', date: order.createdAt, order }))
    const paymentEntries: TimelineEntry[] = (payments ?? []).map((payment) => ({ kind: 'payment', date: payment.createdAt, payment }))
    return [...orderEntries, ...paymentEntries].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [orders, payments])

  if (loadingCustomers) return <LoadingState variant="block" label="Cargando cliente…" />
  if (!customer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cliente" icon={Users} backTo="/customers" backLabel="Volver a clientes" />
        <EmptyState icon={Users} title="Cliente no encontrado" description="Puede que haya sido eliminado o el enlace esté mal." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.fullName}
        icon={Users}
        backTo="/customers"
        backLabel="Volver a clientes"
        meta={<CustomerStatusBadge balance={balance} />}
        actions={
          <>
            {can('customers.edit') && (
              <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            )}
            {can('receivables.collect') && (
              <Button variant="primary" icon={Banknote} onClick={() => setPayOpen(true)} disabled={customerReceivables.length === 0}>
                Registrar pago
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <div className={`${cardClass} space-y-3`}>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-200" aria-hidden>
                {initials(customer.fullName)}
              </span>
              <p className="font-medium text-neutral-100">{customer.fullName}</p>
            </div>
            <div className="space-y-2 text-sm text-neutral-400">
              <p className="flex items-center gap-2">
                <Phone size={13} className="shrink-0 text-neutral-600" aria-hidden /> {customer.phone ?? <span className="text-neutral-600">Sin teléfono</span>}
              </p>
              <p className="flex items-center gap-2">
                <MapPin size={13} className="shrink-0 text-neutral-600" aria-hidden /> {customer.address ?? <span className="text-neutral-600">Sin dirección</span>}
              </p>
              {customer.notes && (
                <p className="flex items-start gap-2">
                  <StickyNote size={13} className="mt-0.5 shrink-0 text-neutral-600" aria-hidden /> <span>{customer.notes}</span>
                </p>
              )}
            </div>
          </div>

          <StatCard
            label="Saldo actual"
            value={formatMoney(balance.balance)}
            hint={balance.orderCount > 0 ? `${balance.orderCount} pedido(s) con saldo` : 'Sin pedidos pendientes'}
            icon={balance.overdue ? AlertTriangle : Banknote}
            tone={balance.overdue ? 'warn' : balance.balance > 0 ? 'brand' : 'good'}
            emphasis
          />
        </div>

        <Card title="Actividad" icon={Receipt} description="Pedidos y pagos de este cliente, del más reciente al más antiguo." padding={false}>
          {ordersError ? (
            <div className="p-5">
              <ErrorState error={ordersErrorObj} onRetry={() => void refetchOrders()} compact />
            </div>
          ) : loadingOrders ? (
            <div className="p-5">
              <LoadingState variant="block" label="Cargando actividad…" />
            </div>
          ) : timeline.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Receipt} title="Sin actividad todavía" description="Los pedidos y pagos de este cliente aparecerán aquí." compact />
            </div>
          ) : (
            <ul className="divide-y divide-neutral-800/70">
              {timeline.map((entry) =>
                entry.kind === 'order' ? (
                  <li key={`order-${entry.order.id}`}>
                    <Link to={`/kitchen?pedido=${entry.order.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-neutral-900/50">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                          Pedido #{entry.order.orderNumber} <OrderStatusBadge status={entry.order.status} size="sm" />
                        </p>
                        <p className="text-xs text-neutral-500">{formatDateTime(entry.order.createdAt)}</p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-neutral-300">{formatMoney(entry.order.total)}</span>
                    </Link>
                  </li>
                ) : (
                  <li key={`payment-${entry.payment.id}`} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-100">
                        Pago recibido {entry.payment.method ? `· ${entry.payment.method}` : ''}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Pedido #{entry.payment.orderNumber} · {formatDateTime(entry.payment.createdAt)}
                        {entry.payment.note ? ` · ${entry.payment.note}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-emerald-400">+{formatMoney(entry.payment.amount)}</span>
                  </li>
                ),
              )}
            </ul>
          )}
        </Card>
      </div>

      <CustomerFormModal open={editOpen} customer={customer} onClose={() => setEditOpen(false)} />
      <RegisterPaymentModal receivables={payOpen ? customerReceivables : null} onClose={() => setPayOpen(false)} />
    </div>
  )
}
