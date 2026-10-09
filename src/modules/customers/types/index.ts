/** ADR 0044: a natural person (default) or a business. */
export type CustomerType = 'person' | 'company'

/**
 * Who the customer is (ADR 0044). A company's trade name is `fullName` (what
 * orders, dispatch and receivables show); `taxId` is its NIT, or a person's
 * optional ID document. `preferred` is informative: no price rule.
 */
export interface CustomerIdentity {
  type?: CustomerType
  legalName?: string | null
  taxId?: string | null
  contactName?: string | null
  preferred?: boolean
  preferredNote?: string | null
}

export interface Customer extends CustomerIdentity {
  id: string
  fullName: string
  phone: string | null
  email?: string | null
  address: string | null
  notes: string | null
}

export interface CustomerInput extends CustomerIdentity {
  fullName: string
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

/**
 * A customer with its figures (ADR 0028), computed in the database. Fields
 * that need a permission are simply absent without it: orders/total/last
 * order/active need orders.view or receivables.view; balance/overdue need
 * receivables.view.
 */
export interface CustomerListRow extends CustomerIdentity {
  id: string
  fullName: string
  phone: string | null
  email?: string | null
  address: string | null
  createdAt: string
  hasWhatsapp: boolean
  orders?: number
  totalPurchased?: number
  lastOrderAt?: string | null
  active?: boolean
  balance?: number
  overdue?: number
}

export interface CustomerDetail extends CustomerListRow {
  notes: string | null
}

export type CustomerStatusFilter = 'all' | 'active' | 'inactive' | 'debt' | 'no_debt' | 'overdue'
export type CustomerSort = 'name' | 'orders' | 'total' | 'balance' | 'last_order' | 'created'

export interface CustomerListQuery {
  search: string
  status: CustomerStatusFilter
  sort: CustomerSort | null
  dir: 'asc' | 'desc' | null
  page: number
  pageSize: number
  createdFrom: string | null
  createdTo: string | null
  minOrders: number | null
  minBalance: number | null
  maxBalance: number | null
  /** ADR 0044: only persons or only companies (null: both). */
  type?: CustomerType | null
  /** ADR 0044: only preferred customers. */
  preferredOnly?: boolean
}

export interface CustomerPage {
  total: number
  sort: CustomerSort
  dir: 'asc' | 'desc'
  /** What the person may see (figures of orders; balances). */
  orders: boolean
  debt: boolean
  rows: CustomerListRow[]
}

export interface CustomersSummary {
  total: number
  /** ADR 0044. */
  preferred?: number
  companies?: number
  active?: number
  withDebt?: number
  pendingBalance?: number
  overdueBalance?: number
  withOverdue?: number
}

// ---------------------------------------------------------------------------
// ADR 0040: the customer 360° sheet.

/** An address of the customer; `isCurrent` is the last delivery address (dk_customers.address). */
export interface CustomerAddress {
  id: string
  address: string
  reference: string | null
  recipientName: string | null
  deliveryNotes: string | null
  isFrequent: boolean
  isCurrent: boolean
  lastUsedAt: string
  archivedAt: string | null
  createdAt: string
}

export type PreferenceKind = 'favorite_dish' | 'liked_ingredient' | 'disliked_ingredient' | 'dietary'

export interface CustomerPreference {
  id: string
  kind: PreferenceKind
  productId: string | null
  ingredientId: string | null
  label: string | null
  note: string | null
  /** The dish's or ingredient's name, or the free text. */
  name: string
  /** false when the dish or ingredient was deactivated. */
  active: boolean
  createdAt: string
}

export type ComplaintCategory = 'quality' | 'delay' | 'wrong_order' | 'missing_item' | 'delivery' | 'service' | 'billing' | 'other'
export type ComplaintStatus = 'pending' | 'in_review' | 'resolved'

export interface CustomerComplaint {
  id: string
  orderId: string | null
  orderNumber: number | null
  category: ComplaintCategory
  description: string
  status: ComplaintStatus
  resolution: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  internalNotes: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
}

/** 'manual' today; 'auto' is reserved for a future recommender (ADR 0040, 2.2). */
export type RecommendationSource = 'manual' | 'auto'

export interface CustomerRecommendation {
  id: string
  productId: string | null
  productName: string | null
  title: string
  reason: string | null
  source: RecommendationSource
  score: number | null
  status: 'active' | 'dismissed'
  createdAt: string
  createdBy: string | null
}

export interface CustomerProfileData {
  addresses: CustomerAddress[]
  preferences: CustomerPreference[]
  complaints: CustomerComplaint[]
  recommendations: CustomerRecommendation[]
}

/** Behaviour from the real orders (not cancelled). */
export interface CustomerOrderStats {
  orders: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  ordersLast90Days: number
  /** Average days between orders; null with fewer than two. */
  avgDaysBetween: number | null
  lastOrder: { id: string; orderNumber: number; status: string; total: number; createdAt: string } | null
  topDishes: { productId: string; name: string; units: number; orders: number }[]
}

export interface PreferenceOptions {
  dishes: { id: string; name: string }[]
  ingredients: { id: string; name: string }[]
}

export interface AddressInput {
  customerId: string
  id?: string | null
  address: string
  reference?: string | null
  recipientName?: string | null
  deliveryNotes?: string | null
  isFrequent?: boolean
  makeCurrent?: boolean
}

export interface ComplaintInput {
  customerId: string
  orderId?: string | null
  category: ComplaintCategory
  description: string
  status?: ComplaintStatus
  resolution?: string | null
  internalNotes?: string | null
}
