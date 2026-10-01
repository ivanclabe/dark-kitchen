/**
 * Dish photos (ADR 0018) live in the public bucket dk-product-images, so a
 * path becomes a plain URL that the browser and the CDN can cache.
 */
export const PRODUCT_IMAGES_BUCKET = 'dk-product-images'
const BUCKET_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}`

export function productImageUrl(path: string): string {
  return `${BUCKET_URL}/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** At most two photos per dish: the main one and a second one. */
export type ProductImagePosition = 1 | 2

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024
export const MAX_SIDE = 1600
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
export const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

/** Why a file cannot be a dish photo, or null if it can. */
export function imageFileProblem(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  const type = file.type || (/\.(heic|heif)$/i.test(file.name) ? 'image/heic' : '')
  if (!ACCEPTED.includes(type)) return 'Usa una foto JPG, PNG o WebP.'
  if (file.size > MAX_SOURCE_BYTES) return 'La foto pesa más de 15 MB.'
  return null
}

/** Size that fits in MAX_SIDE × MAX_SIDE keeping the proportions (never enlarges). */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  extension: 'webp' | 'jpg'
}

/**
 * Phone photos are large: the browser shrinks them to MAX_SIDE and encodes
 * WebP (JPEG where the browser cannot write WebP), usually 150–400 KB.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('No se pudo leer la foto. Prueba con un JPG o PNG.')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la foto.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
  const webp = await encode('image/webp')
  // Browsers that cannot write WebP fall back to PNG silently: use JPEG instead.
  if (webp && webp.type === 'image/webp') return { blob: webp, width, height, extension: 'webp' }
  const jpeg = await encode('image/jpeg')
  if (!jpeg) throw new Error('No se pudo procesar la foto.')
  return { blob: jpeg, width, height, extension: 'jpg' }
}
