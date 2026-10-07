import type { CustomerDetail, CustomerProfileData } from '../../types'
import { CustomerAddresses } from './CustomerAddresses'
import { CustomerComplaints } from './CustomerComplaints'
import { CustomerContact } from './CustomerContact'
import { CustomerNotes } from './CustomerNotes'
import { CustomerOrderSummary } from './CustomerOrderSummary'
import { CustomerPreferences } from './CustomerPreferences'
import { CustomerRecommendations } from './CustomerRecommendations'

/**
 * Resumen of the customer 360° sheet (ADR 0040): the most important first —
 * behaviour, what they like and dislike, what to offer — and on the side,
 * how to reach them, where to deliver, open complaints and the general note.
 */
export function CustomerProfile({
  customer,
  profile,
  canEdit,
  onEdit,
  onOpenOrder,
}: {
  customer: CustomerDetail
  profile: CustomerProfileData
  canEdit: boolean
  onEdit?: () => void
  onOpenOrder: (orderId: string) => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <CustomerOrderSummary customer={customer} onOpenOrder={onOpenOrder} />
        <CustomerPreferences customerId={customer.id} preferences={profile.preferences} canEdit={canEdit} compact />
        <CustomerRecommendations customerId={customer.id} recommendations={profile.recommendations} canEdit={canEdit} />
      </div>
      <div className="space-y-4">
        <CustomerContact customer={customer} onEdit={onEdit} />
        <CustomerAddresses customerId={customer.id} addresses={profile.addresses} canEdit={canEdit} compact />
        <CustomerComplaints customerId={customer.id} complaints={profile.complaints} canEdit={canEdit} onOpenOrder={onOpenOrder} compact />
        <CustomerNotes key={customer.notes ?? ''} customerId={customer.id} notes={customer.notes} canEdit={canEdit} />
      </div>
    </div>
  )
}
