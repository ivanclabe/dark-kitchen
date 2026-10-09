import { supabase } from '@/shared/lib/supabase'
import type { Customer, CustomerDetail, CustomerInput, CustomerListQuery, CustomerPage, CustomersSummary } from '../types'

const COLUMNS = 'id, full_name, phone, email, address, notes, customer_type, legal_name, tax_id, contact_name, preferred, preferred_note'

interface CustomerRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  customer_type: string
  legal_name: string | null
  tax_id: string | null
  contact_name: string | null
  preferred: boolean
  preferred_note: string | null
}

function mapRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    type: row.customer_type === 'company' ? 'company' : 'person',
    legalName: row.legal_name,
    taxId: row.tax_id,
    contactName: row.contact_name,
    preferred: row.preferred,
    preferredNote: row.preferred_note,
  }
}

/** The columns of a customer as written (ADR 0044: a person keeps no company fields). */
function toColumns(input: CustomerInput) {
  const company = input.type === 'company'
  return {
    full_name: input.fullName,
    phone: input.phone || null,
    email: input.email || null,
    address: input.address || null,
    notes: input.notes || null,
    customer_type: company ? 'company' : 'person',
    legal_name: company ? input.legalName || null : null,
    tax_id: input.taxId || null,
    contact_name: company ? input.contactName || null : null,
    preferred: Boolean(input.preferred),
    preferred_note: input.preferred ? input.preferredNote || null : null,
  }
}

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('dk_customers')
    .select(COLUMNS)
    .order('full_name')
  if (error) throw error
  return data.map(mapRow)
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const { data, error } = await supabase
    .from('dk_customers')
    .insert(toColumns(input))
    .select(COLUMNS)
    .single()
  if (error) throw error
  return mapRow(data)
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<void> {
  const { error } = await supabase
    .from('dk_customers')
    .update(toColumns(input))
    .eq('id', id)
  if (error) throw error
}

/** One page of customers, searched, filtered and sorted in the database (ADR 0028). */
export async function listCustomersPage(q: CustomerListQuery): Promise<CustomerPage> {
  const { data, error } = await supabase.rpc('dk_customers_list', {
    p_search: q.search.trim() || undefined,
    p_status: q.status,
    p_sort: q.sort ?? undefined,
    p_dir: q.dir ?? undefined,
    p_limit: q.pageSize,
    p_offset: q.page * q.pageSize,
    p_created_from: q.createdFrom ?? undefined,
    p_created_to: q.createdTo ?? undefined,
    p_min_orders: q.minOrders ?? undefined,
    p_min_balance: q.minBalance ?? undefined,
    p_max_balance: q.maxBalance ?? undefined,
    p_type: q.type ?? undefined,
    p_preferred: q.preferredOnly ? true : undefined,
  })
  if (error) throw error
  return data as unknown as CustomerPage
}

export async function fetchCustomersSummary(): Promise<CustomersSummary> {
  const { data, error } = await supabase.rpc('dk_customers_summary')
  if (error) throw error
  return data as unknown as CustomersSummary
}

/** One customer with its figures; null when it does not exist in this account. */
export async function fetchCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const { data, error } = await supabase.rpc('dk_customer_detail', { p_id: id })
  if (error) throw error
  return (data as unknown as CustomerDetail | null) ?? null
}
