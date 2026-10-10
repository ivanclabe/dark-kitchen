/**
 * ADR 0049 — importing a purchase from an invoice. The file goes to the
 * private bucket, the function dk-invoice-import reads it with AI, the
 * database proposes matches, and the person's reviewed draft is saved in one
 * transaction (dk_create_purchase_from_import). The inventory only moves when
 * the purchase is confirmed, as always.
 */
import { supabase } from '@/shared/lib/supabase'
import { kitchenFilePath } from '@/shared/lib/kitchenFiles'
import type { Extraction, InvoiceImport, InvoiceImportStatus, InvoiceMatch, ReadResult, SaveResult } from '../types/invoiceImport'
import { prepareInvoiceFile, sha256Hex } from '../lib/invoiceFile'

const BUCKET = 'dk-attachments'

export class InvoiceImportError extends Error {
  readonly code: string
  readonly importId: string | null
  readonly retryAfterSeconds: number | null
  constructor(message: string, code: string, importId: string | null = null, retryAfterSeconds: number | null = null) {
    super(message)
    this.code = code
    this.importId = importId
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Uploads the (shrunk) file and asks the AI to read it. `force` reads a file imported before. */
export async function uploadAndReadInvoice(file: File, { force = false }: { force?: boolean } = {}): Promise<ReadResult> {
  const prepared = await prepareInvoiceFile(file)
  const sha256 = await sha256Hex(prepared.blob)
  const filePath = await kitchenFilePath('invoice-imports', crypto.randomUUID(), `factura.${prepared.extension}`)
  const bucket = supabase.storage.from(BUCKET)
  const { error: uploadError } = await bucket.upload(filePath, prepared.blob, { contentType: prepared.mimeType, upsert: false })
  if (uploadError) throw new InvoiceImportError('No pudimos subir el archivo. Revisa tu conexión e intenta de nuevo.', 'UPLOAD')
  const result = await invokeRead({ filePath, fileName: prepared.fileName, mimeType: prepared.mimeType, size: prepared.blob.size, sha256, force })
  // The same file was imported before: this upload is not needed.
  if (result.kind === 'duplicate') await bucket.remove([filePath])
  return result
}

/** Reads again an import that failed (same file). */
export function rereadInvoice(importId: string): Promise<ReadResult> {
  return invokeRead({ importId })
}

async function invokeRead(body: Record<string, unknown>): Promise<ReadResult> {
  const { data, error } = await supabase.functions.invoke<{
    importId?: string
    extraction?: Extraction
    match?: InvoiceMatch
    duplicate?: { importId: string; status: InvoiceImportStatus; purchaseId: string | null; invoiceNumber: string | null }
  }>('dk-invoice-import', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const payload = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null
    throw new InvoiceImportError(
      payload?.message ?? 'No pudimos leer la factura. Intenta de nuevo o crea la compra a mano.',
      payload?.error ?? 'READ_FAILED',
      payload?.importId ?? null,
      payload?.retryAfterSeconds ?? null,
    )
  }
  if (data?.duplicate) return { kind: 'duplicate', ...data.duplicate }
  return { kind: 'read', importId: data!.importId!, extraction: data!.extraction!, match: data!.match! }
}

interface ImportRow {
  id: string
  status: InvoiceImportStatus
  file_name: string
  file_path: string
  mime_type: string
  extraction: unknown
  error: string | null
  purchase_id: string | null
  created_at: string
}

function mapImport(row: ImportRow): InvoiceImport {
  return {
    id: row.id,
    status: row.status,
    fileName: row.file_name,
    filePath: row.file_path,
    mimeType: row.mime_type,
    extraction: (row.extraction as Extraction | null) ?? null,
    error: row.error,
    purchaseId: row.purchase_id,
    createdAt: row.created_at,
  }
}

const IMPORT_SELECT = 'id, status, file_name, file_path, mime_type, extraction, error, purchase_id, created_at'

export async function getInvoiceImport(id: string): Promise<InvoiceImport> {
  const { data, error } = await supabase.from('dk_invoice_imports').select(IMPORT_SELECT).eq('id', id).single()
  if (error) throw error
  return mapImport(data as ImportRow)
}

/** Invoices read but not saved yet («Por revisar»). */
export async function listPendingImports(): Promise<InvoiceImport[]> {
  const { data, error } = await supabase
    .from('dk_invoice_imports')
    .select(IMPORT_SELECT)
    .in('status', ['LEYENDO', 'LISTA', 'ERROR'])
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data as ImportRow[]).map(mapImport)
}

export async function matchInvoice(extraction: Extraction, supplierId: string | null): Promise<InvoiceMatch> {
  const { data, error } = await supabase.rpc('dk_invoice_match', { p_extraction: extraction as never, p_supplier_id: supplierId as string })
  if (error) throw error
  return data as unknown as InvoiceMatch
}

export async function discardInvoiceImport(id: string): Promise<void> {
  const { error } = await supabase.rpc('dk_invoice_import_discard', { p_import_id: id })
  if (error) throw error
}

/** Saves the reviewed purchase (and confirms it when asked) in one transaction. */
export async function savePurchaseFromImport(importId: string, payload: unknown, confirm: boolean): Promise<SaveResult> {
  const { data, error } = await supabase.rpc('dk_create_purchase_from_import', { p_import_id: importId, p_payload: payload as never, p_confirm: confirm })
  if (error) {
    if (error.hint === 'duplicate_invoice') throw new InvoiceImportError(error.message, 'DUPLICATE_INVOICE', importId, null)
    throw error
  }
  return data as unknown as SaveResult
}

/** A short-lived link to see the invoice file. */
export async function getInvoiceFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}

/** The own purchase units of every ingredient («la caja trae 12.000 g»). */
export async function listIngredientPurchaseUnits(): Promise<{ ingredientId: string; unitCode: string; factor: number }[]> {
  const { data, error } = await supabase.from('dk_ingredient_purchase_units').select('ingredient_id, factor_to_base, dk_units ( code )')
  if (error) throw error
  return (data as unknown as { ingredient_id: string; factor_to_base: number; dk_units: { code: string } | null }[]).map((r) => ({
    ingredientId: r.ingredient_id,
    unitCode: r.dk_units?.code ?? '',
    factor: Number(r.factor_to_base),
  }))
}
