export interface Customer {
  id: string
  fullName: string
  phone: string | null
  address: string | null
  notes: string | null
}

export interface CustomerInput {
  fullName: string
  phone?: string | null
  address?: string | null
  notes?: string | null
}

/**
 * A customer with its figures (ADR 0028), computed in the database. Fields
 * that need a permission are simply absent without it: orders/total/last
 * order/active need orders.view or receivables.view; balance/overdue need
 * receivables.view.
 */
export interface CustomerListRow {
  id: string
  fullName: string
  phone: string | null
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
  active?: number
  withDebt?: number
  pendingBalance?: number
  overdueBalance?: number
  withOverdue?: number
}
