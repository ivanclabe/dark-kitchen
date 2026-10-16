import { supabase } from '@/shared/lib/supabase'
import { kitchenFilePath } from '@/shared/lib/kitchenFiles'
import type { PurchasePayment } from '@/modules/finance/types'
import type { Attachment, Purchase, PurchaseHeaderInput, PurchaseInput, PurchaseItem, PurchaseItemInput, PriceReference } from '../types'

interface PurchaseRow {
  id: string
  supplier_id: string
  invoice_number: string | null
  invoice_date: string
  status: Purchase['status']
  subtotal: number
  tax: number
  tax_pct: number | null
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
    taxPct: row.tax_pct == null ? null : Number(row.tax_pct),
    total: Number(row.total),
    notes: row.notes,
  }
}

const PURCHASE_SELECT = `
  id, supplier_id, invoice_number, invoice_date, status, subtotal, tax, tax_pct, total, notes,
  dk_suppliers ( name )
`

/** Compras más recientes primero (ADR 0030 D5): de `limit` en `limit`, o todas las de un proveedor. */
export async function listPurchases({ limit, supplierId }: { limit?: number; supplierId?: string } = {}): Promise<{ rows: Purchase[]; hasMore: boolean }> {
  let query = supabase.from('dk_purchases').select(PURCHASE_SELECT).order('invoice_date', { ascending: false }).order('id', { ascending: false })
  if (supplierId) query = query.eq('supplier_id', supplierId)
  // Una fila de más dice si hay otra página sin contar toda la tabla.
  if (limit) query = query.limit(limit + 1)

  const { data, error } = await query
  if (error) throw error
  const rows = (data as unknown as PurchaseRow[]).map(mapPurchase)
  return limit && rows.length > limit ? { rows: rows.slice(0, limit), hasMore: true } : { rows, hasMore: false }
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
      invoice_number: input.invoiceNumber?.trim() || null,
      invoice_date: input.invoiceDate,
      tax_pct: input.taxPct ?? null,
      notes: input.notes ?? null,
    })
    .select(PURCHASE_SELECT)
    .single()

  if (error) throw error
  return mapPurchase(data as unknown as PurchaseRow)
}

/** Edits a draft header (RLS lets whoever creates purchases do it; a confirmed one is blocked by the guard). */
export async function updatePurchaseHeader(id: string, input: PurchaseHeaderInput): Promise<void> {
  const { error } = await supabase
    .from('dk_purchases')
    .update({ invoice_number: input.invoiceNumber?.trim() || null, invoice_date: input.invoiceDate, tax_pct: input.taxPct })
    .eq('id', id)
    .eq('status', 'BORRADOR')
  if (error) throw error
}

/** Confirms (inventory in) and, ADR 0051, says how it was paid: cash or on credit. */
export async function confirmPurchase(id: string, payment?: PurchasePayment): Promise<void> {
  const { error } = await supabase.rpc('dk_confirm_purchase', { p_purchase_id: id, ...(payment ? { p_payment: payment as never } : {}) })
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

interface PriceReferenceRow {
  avgCost: number | null
  last: { date: string; supplier: string; unitId: string; unitCode: string; unitCost: number; perBase: number } | null
  avg90PerBase: number | null
}

/**
 * Last confirmed price and 90-day average per base unit (ADR 0063 D4), for several ingredients in one call.
 * The «last» purchase is the most recent invoice date, across all purchases (the old query sorted per line).
 */
export async function fetchPriceReferences(ingredientIds: string[]): Promise<Record<string, PriceReference>> {
  if (ingredientIds.length === 0) return {}
  const { data, error } = await supabase.rpc('dk_price_references', { p_ingredient_ids: ingredientIds })
  if (error) throw error
  const rows = (data as unknown as Record<string, PriceReferenceRow> | null) ?? {}
  return Object.fromEntries(
    Object.entries(rows).map(([id, r]) => [
      id,
      {
        avgCost: Number(r.avgCost ?? 0),
        avg90PerBase: r.avg90PerBase == null ? null : Number(r.avg90PerBase),
        last: r.last
          ? {
              unitCost: Number(r.last.unitCost),
              purchaseUnitId: r.last.unitId,
              purchaseUnitCode: r.last.unitCode,
              supplierName: r.last.supplier,
              invoiceDate: r.last.date,
              perBase: Number(r.last.perBase),
            }
          : null,
      },
    ]),
  )
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
  const path = await kitchenFilePath('purchases', purchaseId, file.name)

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
