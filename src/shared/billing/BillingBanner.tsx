import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import { BILLING_ACCESS_KEY, billingNotice, fetchBillingAccess } from './billing'

export function BillingBanner() {
  const { organization } = useActiveKitchen()
  const { data } = useQuery({ queryKey: BILLING_ACCESS_KEY, queryFn: fetchBillingAccess, staleTime: 60_000 })
  const access = data?.find((a) => a.organizationId === organization?.id)
  const notice = access ? billingNotice(access) : null
  if (!notice) return null
  const Icon = notice.tone === 'danger' ? AlertTriangle : CalendarClock
  return (
    <div
      role={notice.tone === 'danger' ? 'alert' : 'status'}
      className={clsx(
        'mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-sm',
        notice.tone === 'danger' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      )}
    >
      <Icon size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{notice.text}</span>
      <KitchenLink to="/settings/billing" className="font-semibold underline-offset-4 hover:underline">
        Ir a Facturación
      </KitchenLink>
    </div>
  )
}
