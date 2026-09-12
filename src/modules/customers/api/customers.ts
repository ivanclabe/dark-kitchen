import { supabase } from '@/shared/lib/supabase'
import type { Customer, CustomerInput } from '../types'

function mapRow(row: { id: string; full_name: string; phone: string | null; address: string | null; notes: string | null }): Customer {
  return { id: row.id, fullName: row.full_name, phone: row.phone, address: row.address, notes: row.notes }
}

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('dk_customers')
    .select('id, full_name, phone, address, notes')
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
      address: input.address || null,
      notes: input.notes || null,
    })
    .select('id, full_name, phone, address, notes')
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
      address: input.address || null,
      notes: input.notes || null,
    })
    .eq('id', id)
  if (error) throw error
}
