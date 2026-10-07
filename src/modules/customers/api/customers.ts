import { supabase } from '@/shared/lib/supabase'
import type { Customer, CustomerDetail, CustomerInput, CustomerListQuery, CustomerPage, CustomersSummary } from '../types'

function mapRow(row: { id: string; full_name: string; phone: string | null; email: string | null; address: string | null; notes: string | null }): Customer {
  return { id: row.id, fullName: row.full_name, phone: row.phone, email: row.email, address: row.address, notes: row.notes }
}

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('dk_customers')
    .select('id, full_name, phone, email, address, notes')
    .order('full_name')
  if (error) throw error
  return data.map(mapRow)
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const { data, error } = await supabase
    .from('dk_customers')
    .insert({
      full_name: input.fullName,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
    })
    .select('id, full_name, phone, email, address, notes')
    .single()
  if (error) throw error
  return mapRow(data)
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<void> {
  const { error } = await supabase
    .from('dk_customers')
    .update({
      full_name: input.fullName,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      notes: input.notes || null,
    })
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
