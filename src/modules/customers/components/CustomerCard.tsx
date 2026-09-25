import { cardClass } from '@/shared/ui/formClasses'
import { initials } from '@/shared/utils/format'
import { MapPin, Phone } from 'lucide-react'
import { KitchenLink as Link } from '@/shared/kitchen/KitchenLink'
import type { CustomerBalance } from '../lib/balance'
import type { Customer } from '../types'
import { CustomerStatusBadge } from './CustomerStatusBadge'

export function CustomerCard({ customer, balance }: { customer: Customer; balance: CustomerBalance }) {
  return (
    <Link to={`/customers/${customer.id}`} className={`${cardClass} flex flex-col gap-3 !p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-200" aria-hidden>
            {initials(customer.fullName)}
          </span>
          <p className="truncate font-medium text-neutral-100">{customer.fullName}</p>
        </div>
      </div>

      <div className="space-y-1 text-xs text-neutral-500">
        {customer.phone && (
          <p className="flex items-center gap-1.5 truncate">
            <Phone size={11} className="shrink-0" aria-hidden /> {customer.phone}
          </p>
        )}
        {customer.address && (
          <p className="flex items-center gap-1.5 truncate">
            <MapPin size={11} className="shrink-0" aria-hidden /> {customer.address}
          </p>
        )}
      </div>

      <div className="mt-auto pt-1">
        <CustomerStatusBadge balance={balance} />
      </div>
    </Link>
  )
}
