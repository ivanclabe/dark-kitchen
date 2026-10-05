import { RegisterPaymentModal } from '@/modules/cartera/components/RegisterPaymentModal'
import { useCustomerReceivables } from '@/modules/cartera/hooks/useReceivables'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Menu, type MenuItem } from '@/shared/ui/Menu'
import { Banknote, ClipboardList, Eye, MoreHorizontal, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCustomerDetail } from '../hooks/useCustomers'
import type { CustomerListRow } from '../types'
import { CustomerFormModal } from './CreateCustomerModal'

/** Loads the full customer (notes included) only when editing. */
function EditCustomer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useCustomerDetail(id)
  return <CustomerFormModal open={!!data} customer={data ? { id: data.id, fullName: data.fullName, phone: data.phone, address: data.address, notes: data.notes } : undefined} onClose={onClose} />
}

/** Loads the customer's orders with balance only when registering a payment. */
function PayCustomer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useCustomerReceivables(id)
  return <RegisterPaymentModal receivables={data?.filter((r) => r.balance > 0) ?? null} onClose={onClose} />
}

/**
 * The actions that exist for a customer (ADR 0028): see it, edit it, see its
 * orders, register a payment (with balance and the permission).
 */
export function CustomerActions({ customer }: { customer: CustomerListRow }) {
  const { can, path } = useActiveKitchen()
  const navigate = useNavigate()
  const [open, setOpen] = useState<'edit' | 'pay' | null>(null)
  const items: MenuItem[] = [
    { label: 'Ver cliente', icon: Eye, onSelect: () => navigate(path(`/customers/${customer.id}`)) },
    ...(can('customers.edit') ? [{ label: 'Editar', icon: Pencil, onSelect: () => setOpen('edit') }] : []),
    ...(customer.orders !== undefined ? [{ label: 'Ver pedidos', icon: ClipboardList, onSelect: () => navigate(path(`/customers/${customer.id}?tab=orders`)) }] : []),
    ...(can('receivables.collect') && (customer.balance ?? 0) > 0 ? [{ label: 'Registrar pago', icon: Banknote, onSelect: () => setOpen('pay') }] : []),
  ]
  return (
    // The row opens the customer: the menu must not.
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Menu
        items={items}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={`Acciones de ${customer.fullName}`}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none"
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
        )}
      />
      {open === 'edit' && <EditCustomer id={customer.id} onClose={() => setOpen(null)} />}
      {open === 'pay' && <PayCustomer id={customer.id} onClose={() => setOpen(null)} />}
    </div>
  )
}
