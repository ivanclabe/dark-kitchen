import { supabase } from '@/shared/lib/supabase'
import type { Supplier, SupplierInput } from '../types'

function mapRow(row: {
  id: string
  name: string
  tax_id: string | null
  phone: string | null
  email: string | null
  address: string | null
  contact_name: string | null
  active: boolean
}): Supplier {
  return {
    id: row.id,
    name: row.name,
    taxId: row.tax_id,
    phone: row.phone,
    email: row.email,
    address: row.address,
    contactName: row.contact_name,
    active: row.active,
  }
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('dk_suppliers')
    .select('id, name, tax_id, phone, email, address, contact_name, active')
    .order('name')

  if (error) throw error
  return data.map(mapRow)
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const { data, error } = await supabase
    .from('dk_suppliers')
    .insert({
      name: input.name,
      tax_id: input.taxId ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      contact_name: input.contactName ?? null,
    })
    .select('id, name, tax_id, phone, email, address, contact_name, active')
    .single()

  if (error) throw error
  return mapRow(data)
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<Supplier> {
  const { data, error } = await supabase
    .from('dk_suppliers')
    .update({
      name: input.name,
      tax_id: input.taxId ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      contact_name: input.contactName ?? null,
    })
    .eq('id', id)
    .select('id, name, tax_id, phone, email, address, contact_name, active')
    .single()

  if (error) throw error
  return mapRow(data)
}

export async function setSupplierActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('dk_suppliers').update({ active }).eq('id', id)
  if (error) throw error
}
