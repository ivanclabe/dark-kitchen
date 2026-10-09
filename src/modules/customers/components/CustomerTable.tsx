import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import { formatPhone } from '@/shared/utils/phone'
import { companyLine } from '../lib/identity'
import { CustomerMarks } from './CustomerIdentity'
import { Badge } from '@/shared/ui/Badge'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { SortableHeader } from '@/shared/ui/SortableHeader'
import { formatMoney } from '@/shared/utils/format'
import clsx from 'clsx'
import { MessageCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { relativeDay } from '../lib/dates'
import type { CustomerListRow, CustomerSort } from '../types'
import { CustomerActions } from './CustomerActions'

/** The balance at a glance: an amount owed reads stronger; overdue gets one soft badge; zero is quiet. */
export function BalanceCell({ balance, overdue }: { balance: number; overdue: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {overdue > 0 && (
        <Badge size="sm" tone="warning">
          Vencido
        </Badge>
      )}
      <span className={clsx('tabular-nums', balance > 0 ? 'font-semibold text-neutral-50' : 'text-neutral-500')}>{formatMoney(balance)}</span>
    </span>
  )
}

export function ActivityBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge size="sm" tone="success" dot>
      Activo
    </Badge>
  ) : (
    <Badge size="sm" tone="neutral" dot>
      Inactivo
    </Badge>
  )
}

/**
 * The customers table (ADR 0028): the center of the module. Sortable columns
 * (sorted in the database), the whole row opens the customer, actions on the
 * right. Below md it becomes a compact list (never a sideways-scrolling page).
 */
export function CustomerTable({
  rows,
  showOrders,
  showDebt,
  sort,
  onSort,
  isLoading,
  emptyState,
}: {
  rows: CustomerListRow[] | undefined
  showOrders: boolean
  showDebt: boolean
  sort: { key: CustomerSort; dir: 'asc' | 'desc' }
  onSort: (key: CustomerSort) => void
  isLoading: boolean
  emptyState: ReactNode
}) {
  const { path } = useActiveKitchen()
  const navigate = useNavigate()
  const header = (label: string, key: CustomerSort, align: 'left' | 'right' = 'left') => <SortableHeader label={label} column={key} sort={sort} onSort={onSort} align={align} />

  const columns: DataTableColumn<CustomerListRow>[] = [
    {
      key: 'customer',
      header: header('Cliente', 'name'),
      cell: (c) => (
        <span className="block min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-neutral-100">{c.fullName}</span>
            <CustomerMarks customer={c} compact />
          </span>
          <span className="block truncate text-xs text-neutral-500">{[companyLine(c), `Desde ${relativeDay(c.createdAt)}`].filter(Boolean).join(' · ')}</span>
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contacto',
      hideBelow: 'lg',
      cell: (c) => (
        <span className="block min-w-0 text-sm">
          <span className="flex items-center gap-1.5 text-neutral-300">
            {c.phone ? formatPhone(c.phone) : <span className="text-neutral-600">Sin teléfono</span>}
            {c.hasWhatsapp && <MessageCircle size={13} className="text-emerald-400" aria-label="Vinculado a WhatsApp" />}
          </span>
          {c.email && <span className="block max-w-[14rem] truncate text-xs text-neutral-400">{c.email}</span>}
          {c.address && <span className="block max-w-[14rem] truncate text-xs text-neutral-500">{c.address}</span>}
        </span>
      ),
    },
    ...(showOrders
      ? ([
          { key: 'orders', header: header('Pedidos', 'orders', 'right'), align: 'right', cell: (c) => <span className="tabular-nums">{c.orders ?? 0}</span> },
          { key: 'total', header: header('Total comprado', 'total', 'right'), align: 'right', hideBelow: 'lg', cell: (c) => <span className="tabular-nums text-neutral-200">{formatMoney(c.totalPurchased ?? 0)}</span> },
        ] satisfies DataTableColumn<CustomerListRow>[])
      : []),
    ...(showDebt
      ? ([{ key: 'balance', header: header('Saldo', 'balance', 'right'), align: 'right', cell: (c) => <BalanceCell balance={c.balance ?? 0} overdue={c.overdue ?? 0} /> }] satisfies DataTableColumn<CustomerListRow>[])
      : []),
    ...(showOrders
      ? ([
          { key: 'last', header: header('Último pedido', 'last_order'), hideBelow: 'lg', cell: (c) => <span className="text-neutral-300">{c.lastOrderAt ? relativeDay(c.lastOrderAt) : <span className="text-neutral-600">Nunca</span>}</span> },
          { key: 'status', header: 'Estado', hideBelow: 'lg', cell: (c) => <ActivityBadge active={c.active ?? false} /> },
        ] satisfies DataTableColumn<CustomerListRow>[])
      : []),
    { key: 'actions', header: <span className="sr-only">Acciones</span>, align: 'right', cell: (c) => <CustomerActions customer={c} /> },
  ]

  return (
    <>
      <div className="hidden md:block">
        <DataTable columns={columns} rows={rows} getRowId={(c) => c.id} isLoading={isLoading} onRowClick={(c) => navigate(path(`/customers/${c.id}`))} emptyState={emptyState} />
      </div>
      {/* Phones: a compact list, two lines per customer. */}
      <div className="md:hidden">
        {isLoading && !rows ? (
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60" aria-busy>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="h-[60px] animate-pulse px-4 py-3">
                <span className="block h-3.5 w-1/2 rounded bg-neutral-800" />
                <span className="mt-2 block h-3 w-1/3 rounded bg-neutral-800/70" />
              </li>
            ))}
          </ul>
        ) : !rows?.length ? (
          emptyState
        ) : (
          <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-2 pr-2">
                <Link to={`/customers/${c.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-neutral-100">{c.fullName}</span>
                      <CustomerMarks customer={c} compact />
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {[formatPhone(c.phone), showOrders ? (c.lastOrderAt ? `Último: ${relativeDay(c.lastOrderAt)}` : 'Sin pedidos') : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {showDebt && <BalanceCell balance={c.balance ?? 0} overdue={c.overdue ?? 0} />}
                </Link>
                <CustomerActions customer={c} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
