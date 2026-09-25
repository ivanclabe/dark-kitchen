import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useRecentPayments, useReceivables } from '@/modules/cartera/hooks/useReceivables'
import type { Receivable } from '@/modules/cartera/types'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Input } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { StatCard } from '@/shared/ui/StatCard'
import { formatDateTime, formatMoney, todayStr } from '@/shared/utils/format'
import { AlertTriangle, Clock, Plus, Search, Sparkles, Users, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CustomerCard } from '../components/CustomerCard'
import { CustomerFormModal } from '../components/CreateCustomerModal'
import { useCustomers } from '../hooks/useCustomers'
import { computeCustomerBalance } from '../lib/balance'

type Filter = 'todos' | 'con_saldo' | 'vencidos'

/** Dashboard único de Clientes — fusiona lo que antes eran las pestañas "Cuentas por cobrar" y "Clientes", sin tabla gigante: tarjetas + estado en lenguaje simple. */
export function CustomersPage() {
  const { can } = useActiveKitchen()
  const { data: customers, isLoading, isError, error, refetch } = useCustomers()
  const { data: receivables } = useReceivables()
  const { data: recentPayments } = useRecentPayments(8)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [createOpen, setCreateOpen] = useState(false)
  const today = todayStr()

  const receivablesByCustomer = useMemo(() => {
    const map = new Map<string, Receivable[]>()
    for (const r of receivables ?? []) {
      const list = map.get(r.customerId)
      if (list) list.push(r)
      else map.set(r.customerId, [r])
    }
    return map
  }, [receivables])

  const summary = useMemo(() => {
    const rows = receivables ?? []
    const totalPending = rows.reduce((sum, r) => sum + r.balance, 0)
    const overdueRows = rows.filter((r) => r.dueDate && r.dueDate < today)
    const totalOverdue = overdueRows.reduce((sum, r) => sum + r.balance, 0)
    const customersWithBalance = receivablesByCustomer.size
    const recentCustomerIds = new Set((recentPayments ?? []).map((p) => p.customerId))
    return { totalPending, totalOverdue, customersWithBalance, recentPaymentsCount: recentPayments?.length ?? 0, recentCustomers: recentCustomerIds.size }
  }, [receivables, today, receivablesByCustomer, recentPayments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (customers ?? []).filter((c) => {
      if (q && !c.fullName.toLowerCase().includes(q) && !(c.phone?.toLowerCase().includes(q) ?? false)) return false
      const balance = computeCustomerBalance(receivablesByCustomer.get(c.id) ?? [])
      if (filter === 'con_saldo' && balance.balance <= 0) return false
      if (filter === 'vencidos' && !balance.overdue) return false
      return true
    })
  }, [customers, query, filter, receivablesByCustomer])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description={customers ? `${customers.length} clientes` : 'Clientes, saldos y pagos en un solo lugar.'}
        icon={Users}
        actions={
          can('customers.create') && (
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Nuevo cliente
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total pendiente" value={formatMoney(summary.totalPending)} hint={`${receivables?.length ?? 0} pedidos con saldo`} icon={Wallet} tone="brand" emphasis />
        <StatCard
          label="Vencido"
          value={formatMoney(summary.totalOverdue)}
          hint={summary.totalOverdue > 0 ? 'Requiere seguimiento' : 'Nada vencido'}
          icon={AlertTriangle}
          tone={summary.totalOverdue > 0 ? 'warn' : 'good'}
        />
        <StatCard label="Clientes con saldo" value={summary.customersWithBalance} icon={Clock} />
        <StatCard label="Pagos recientes" value={summary.recentPaymentsCount} hint={`${summary.recentCustomers} clientes`} icon={Sparkles} tone="good" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 mt-[3px] -translate-y-1/2 text-neutral-500" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar clientes" className="pl-9" />
            </div>
            <Chip label="Todos" active={filter === 'todos'} onClick={() => setFilter('todos')} />
            <Chip label="Con saldo" active={filter === 'con_saldo'} onClick={() => setFilter('con_saldo')} />
            <Chip label="Vencidos" active={filter === 'vencidos'} onClick={() => setFilter('vencidos')} />
          </div>

          {isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isLoading ? (
            <LoadingState variant="cards" rows={2} cols={3} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={query || filter !== 'todos' ? 'Sin resultados' : 'Todavía no hay clientes'}
              description={
                query || filter !== 'todos' ? 'Ajusta la búsqueda o el filtro.' : 'Los clientes también se crean solos al registrar un pedido por WhatsApp.'
              }
              action={
                !query && filter === 'todos' && can('customers.create') ? (
                  <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
                    Crear el primero
                  </Button>
                ) : undefined
              }
              compact
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((customer) => (
                <CustomerCard key={customer.id} customer={customer} balance={computeCustomerBalance(receivablesByCustomer.get(customer.id) ?? [])} />
              ))}
            </div>
          )}
        </div>

        <Card title="Actividad reciente" icon={Sparkles} className="h-fit">
          {!recentPayments || recentPayments.length === 0 ? (
            <p className="text-sm text-neutral-500">Todavía no hay pagos registrados.</p>
          ) : (
            <ul className="space-y-3">
              {recentPayments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-200">{p.customerName}</p>
                    <p className="text-xs text-neutral-500">
                      #{p.orderNumber} · {formatDateTime(p.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-emerald-400">+{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <CustomerFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
