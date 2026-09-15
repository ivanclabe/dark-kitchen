import { supabase } from '@/shared/lib/supabase'
import type { Attachment, LastIngredientPrice, Purchase, PurchaseInput, PurchaseItem, PurchaseItemInput } from '../types'

interface PurchaseRow {
  id: string
  supplier_id: string
  invoice_number: string
  invoice_date: string
  status: Purchase['status']
  subtotal: number
  tax: number
  total: number
  notes: string | null
  dk_suppliers: { name: string } | null
}

function mapPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.dk_suppliers?.name ?? '—',
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    status: row.status,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    notes: row.notes,
  }
}

const PURCHASE_SELECT = `
  id, supplier_id, invoice_number, invoice_date, status, subtotal, tax, total, notes,
  dk_suppliers ( name )
`

export async function listPurchases(): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from('dk_purchases')
    .select(PURCHASE_SELECT)
    .order('invoice_date', { ascending: false })

  if (error) throw error
  return (data as unknown as PurchaseRow[]).map(mapPurchase)
}

export async function getPurchase(id: string): Promise<Purchase> {
  const { data, error } = await supabase.from('dk_purchases').select(PURCHASE_SELECT).eq('id', id).single()
  if (error) throw error
  return mapPurchase(data as unknown as PurchaseRow)
}

export async function createPurchase(input: PurchaseInput): Promise<Purchase> {
  const { data, error } = await supabase
    .from('dk_purchases')
    .insert({
      supplier_id: input.supplierId,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate,
      tax: input.tax ?? 0,
      notes: input.notes ?? null,
    })
    .select(PURCHASE_SELECT)
    .single()

  if (error) throw error
  return mapPurchase(data as unknown as PurchaseRow)
}

export async function confirmPurchase(id: string): Promise<void> {
  const { error } = await supabase.rpc('dk_confirm_purchase', { p_purchase_id: id })
  if (error) throw error
}

interface PurchaseItemRow {
  id: string
  purchase_id: string
  ingredient_id: string
  quantity: number
  purchase_unit_id: string
  unit_cost: number
  line_total: number
  dk_ingredients: { name: string } | null
  dk_units: { code: string } | null
}

function mapItem(row: PurchaseItemRow): PurchaseItem {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    ingredientId: row.ingredient_id,
    ingredientName: row.dk_ingredients?.name ?? '—',
    quantity: Number(row.quantity),
    purchaseUnitId: row.purchase_unit_id,
    purchaseUnitCode: row.dk_units?.code ?? '',
    unitCost: Number(row.unit_cost),
    lineTotal: Number(row.line_total),
  }
}

export async function listPurchaseItems(purchaseId: string): Promise<PurchaseItem[]> {
  const { data, error } = await supabase
    .from('dk_purchase_items')
    .select(
      'id, purchase_id, ingredient_id, quantity, purchase_unit_id, unit_cost, line_total, dk_ingredients ( name ), dk_units ( code )',
    )
    .eq('purchase_id', purchaseId)
    .order('created_at')

  if (error) throw error
  return (data as unknown as PurchaseItemRow[]).map(mapItem)
}

export async function addPurchaseItem(purchaseId: string, input: PurchaseItemInput): Promise<void> {
  const { error } = await supabase.from('dk_purchase_items').insert({
    purchase_id: purchaseId,
    ingredient_id: input.ingredientId,
    quantity: input.quantity,
    purchase_unit_id: input.purchaseUnitId,
    unit_cost: input.unitCost,
  })
  if (error) throw error
}

export async function deletePurchaseItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('dk_purchase_items').delete().eq('id', itemId)
  if (error) throw error
}

interface LastPriceRow {
  unit_cost: number
  purchase_unit_id: string
  dk_units: { code: string } | null
  dk_purchases: { invoice_date: string; dk_suppliers: { name: string } | null } | null
}

export async function getLastIngredientPrice(ingredientId: string): Promise<LastIngredientPrice | null> {
  const { data, error } = await supabase
    .from('dk_purchase_items')
    .select('unit_cost, purchase_unit_id, dk_units ( code ), dk_purchases!inner ( invoice_date, status, dk_suppliers ( name ) )')
    .eq('ingredient_id', ingredientId)
    .eq('dk_purchases.status', 'CONFIRMADA')
    .order('invoice_date', { ascending: false, referencedTable: 'dk_purchases' })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  const row = data as unknown as LastPriceRow
  return {
    unitCost: Number(row.unit_cost),
    purchaseUnitId: row.purchase_unit_id,
    purchaseUnitCode: row.dk_units?.code ?? '',
    supplierName: row.dk_purchases?.dk_suppliers?.name ?? '—',
    invoiceDate: row.dk_purchases?.invoice_date ?? '',
  }
}

export async function listAttachments(purchaseId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('dk_attachments')
    .select('id, file_name, file_path, created_at')
    .eq('entity_type', 'purchase')
    .eq('entity_id', purchaseId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    filePath: row.file_path,
    createdAt: row.created_at,
  }))
}

export async function uploadInvoiceAttachment(purchaseId: string, file: File): Promise<void> {
  const path = `purchases/${purchaseId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage.from('dk-attachments').upload(path, file)
  if (uploadError) throw uploadError

  const { error: insertError } = await supabase.from('dk_attachments').insert({
    entity_type: 'purchase',
    entity_id: purchaseId,
    file_path: path,
    file_name: file.name,
    mime_type: file.type || null,
  })
  if (insertError) throw insertError
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('dk-attachments').createSignedUrl(filePath, 60 * 5)
  if (error) throw error
  return data.signedUrl
}
