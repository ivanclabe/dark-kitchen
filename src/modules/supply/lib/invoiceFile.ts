/**
 * ADR 0049 — the invoice file before it is uploaded: photos are shrunk in the
 * browser (the model reads up to 5 MB per image and a sharp 2400 px photo is
 * plenty), PDFs go as they are (up to 10 MB). The SHA-256 lets Quanela say
 * «Ya importaste este archivo».
 */
import { fitWithin } from '@/modules/products/lib/productImages'

export const MAX_INVOICE_BYTES = 10 * 1024 * 1024
export const MAX_PHOTO_SOURCE_BYTES = 25 * 1024 * 1024
export const INVOICE_MAX_SIDE = 2400
export const INVOICE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export function invoiceFileKind(file: Pick<File, 'type' | 'name'>): 'pdf' | 'photo' | null {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  const type = file.type || (/\.(heic|heif)$/i.test(file.name) ? 'image/heic' : '')
  return PHOTO_TYPES.includes(type) ? 'photo' : null
}

/** Why a file cannot be read as an invoice, or null. */
export function invoiceFileProblem(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  const kind = invoiceFileKind(file)
  if (!kind) return 'Sube una foto (JPG, PNG o WebP) o un PDF de la factura.'
  if (kind === 'pdf' && file.size > MAX_INVOICE_BYTES) return 'El PDF pesa más de 10 MB.'
  if (kind === 'photo' && file.size > MAX_PHOTO_SOURCE_BYTES) return 'La foto pesa más de 25 MB.'
  return null
}

export interface PreparedInvoice {
  blob: Blob
  mimeType: 'image/jpeg' | 'application/pdf'
  extension: 'jpg' | 'pdf'
  /** What the person called it (shown in the purchase attachments). */
  fileName: string
}

/** A photo is shrunk to INVOICE_MAX_SIDE and saved as JPEG; a PDF goes as it is. */
export async function prepareInvoiceFile(file: File): Promise<PreparedInvoice> {
  const fileName = file.name || 'factura'
  if (invoiceFileKind(file) === 'pdf') return { blob: file, mimeType: 'application/pdf', extension: 'pdf', fileName }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('No se pudo abrir la foto. Prueba con un JPG o con un PDF.')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, INVOICE_MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la foto.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!blob) throw new Error('No se pudo procesar la foto.')
  return { blob, mimeType: 'image/jpeg', extension: 'jpg', fileName: fileName.replace(/\.(heic|heif|png|webp)$/i, '.jpg') }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * A file dropped on the purchases list travels to the import screen here
 * (it cannot go in the URL or the history state reliably).
 */
let pendingFile: File | null = null
export function setPendingInvoiceFile(file: File | null) {
  pendingFile = file
}
export function takePendingInvoiceFile(): File | null {
  const file = pendingFile
  pendingFile = null
  return file
}
