/**
 * ADR 0052 — the public menu: three functions an anonymous visitor may call
 * (the menu of today, place an order, track it) and the staff options.
 * ADR 0053 — its design: draft, publish, discard, revert and brand images.
 */
import { PRODUCT_IMAGES_BUCKET, prepareImage } from '@/modules/products/lib/productImages'
import { supabase } from '@/shared/lib/supabase'
import type { ThemeDesign } from '../lib/themes'
import type { MenuDesign, OrderStatus, PlaceOrderErrorCode, PlaceOrderInput, PlaceOrderResult, PublicMenu, PublicMenuSettings } from '../types'

export async function getPublicMenu(slug: string): Promise<PublicMenu | null> {
  const { data, error } = await supabase.rpc('dk_public_menu', { p_slug: slug })
  if (error) throw error
  const menu = data as unknown as PublicMenu | { found: false }
  return menu && menu.found ? (menu as PublicMenu) : null
}

export class PlaceOrderError extends Error {
  readonly code: PlaceOrderErrorCode
  /** A product id (unavailable, limit) or a value (opens at, minimum). */
  readonly detail: string | null
  constructor(message: string, code: PlaceOrderErrorCode, detail: string | null) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

const CODES: PlaceOrderErrorCode[] = ['closed', 'not_accepting', 'unavailable', 'limit', 'stock', 'min_order', 'invalid', 'rate_limited']

export async function placePublicOrder(slug: string, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { data, error } = await supabase.rpc('dk_public_place_order', { p_slug: slug, p_order: input as never })
  if (error) {
    const code = (CODES as string[]).includes(error.hint ?? '') ? (error.hint as PlaceOrderErrorCode) : error.message?.toLowerCase().includes('fetch') ? 'network' : 'invalid'
    throw new PlaceOrderError(code === 'network' ? 'No pudimos enviar el pedido. Revisa tu conexión e intenta de nuevo.' : error.message, code, error.details || null)
  }
  return data as unknown as PlaceOrderResult
}

export async function getOrderStatus(token: string): Promise<OrderStatus | null> {
  const { data, error } = await supabase.rpc('dk_public_order_status', { p_token: token })
  if (error) throw error
  return (data as unknown as OrderStatus | null) ?? null
}

export async function getPublicMenuSettings(): Promise<PublicMenuSettings> {
  const { data, error } = await supabase.rpc('dk_public_menu_settings')
  if (error) throw error
  return data as unknown as PublicMenuSettings
}

export async function savePublicMenuSettings(
  patch: Partial<Omit<PublicMenuSettings, 'slug' | 'name' | 'iconKey' | 'whatsapp' | 'tagline' | 'publishedAt' | 'openState' | 'hasHours' | 'theme' | 'themeDraft' | 'themePublishedAt' | 'hasPreviousTheme'>>,
): Promise<void> {
  const { error } = await supabase.rpc('dk_public_menu_settings_save', { p: patch as never })
  if (error) throw error
}

/** Today's menu even when not published, with the DRAFT design (staff only). */
export async function getPublicMenuPreview(): Promise<PublicMenu | null> {
  const { data, error } = await supabase.rpc('dk_public_menu_preview')
  if (error) throw error
  const menu = data as unknown as PublicMenu | { found: false }
  return menu && menu.found ? (menu as PublicMenu) : null
}

/** The server validates it (closed lists, images of this account only). */
export async function saveThemeDraft(design: ThemeDesign): Promise<void> {
  const { error } = await supabase.rpc('dk_public_menu_theme_save_draft', { p_theme: design as never })
  if (error) throw error
}

export async function publishTheme(): Promise<void> {
  const { error } = await supabase.rpc('dk_public_menu_theme_publish')
  if (error) throw error
}

export async function discardThemeDraft(): Promise<void> {
  const { error } = await supabase.rpc('dk_public_menu_theme_discard')
  if (error) throw error
}

export async function revertTheme(): Promise<void> {
  const { error } = await supabase.rpc('dk_public_menu_theme_revert')
  if (error) throw error
}

export type BrandImageKind = 'cover' | 'background' | 'logo'

/**
 * A brand image, shrunk in the browser, to kitchens/{account}/branding/. Returns its path.
 * ADR 0058: a logo is small (600 px) and sits on white, like the tile it is shown on.
 */
export async function uploadBrandImage(kitchenId: string, file: File, kind: BrandImageKind): Promise<string> {
  const image = kind === 'logo' ? await prepareImage(file, { maxSide: 600, fill: '#FFFFFF' }) : await prepareImage(file)
  const path = `kitchens/${kitchenId}/branding/${kind}-${crypto.randomUUID()}.${image.extension}`
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, image.blob, {
    contentType: image.extension === 'webp' ? 'image/webp' : 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw error
  return path
}

// ---------------------------------------------------------------------------
// ADR 0054 — «Mis diseños» and the AI designer
// ---------------------------------------------------------------------------
export async function listDesigns(): Promise<MenuDesign[]> {
  const { data, error } = await supabase.rpc('dk_menu_design_list')
  if (error) throw error
  return (data as unknown as MenuDesign[]) ?? []
}

/** Keep the editor's design in «Mis diseños». It does not touch the draft nor the public page. */
export async function saveDesign(name: string, design: ThemeDesign): Promise<MenuDesign> {
  const { data, error } = await supabase.rpc('dk_menu_design_save', { p_name: name, p_design: design as never, p_source: 'editor' })
  if (error) throw error
  return data as unknown as MenuDesign
}

export async function updateDesign(id: string, patch: { name?: string; favorite?: boolean }): Promise<MenuDesign> {
  const { data, error } = await supabase.rpc('dk_menu_design_update', { p_id: id, p_name: patch.name, p_favorite: patch.favorite })
  if (error) throw error
  return data as unknown as MenuDesign
}

export async function deleteDesign(id: string): Promise<void> {
  const { error } = await supabase.rpc('dk_menu_design_delete', { p_id: id })
  if (error) throw error
}

/** «Usar en el editor»: the design becomes the draft (a draft with unpublished changes is kept first). */
export async function applyDesignAsDraft(id: string): Promise<{ backedUp: boolean }> {
  const { data, error } = await supabase.rpc('dk_menu_design_use', { p_id: id })
  if (error) throw error
  return data as unknown as { backedUp: boolean }
}

/** «Publicar»: customers see this design from now on (the current one becomes «anterior»). */
export async function publishDesign(id: string): Promise<{ backedUp: boolean }> {
  const { data, error } = await supabase.rpc('dk_menu_design_publish', { p_id: id })
  if (error) throw error
  return data as unknown as { backedUp: boolean }
}

export class DesignerError extends Error {
  readonly code: string
  readonly reason: string | null
  constructor(message: string, code: string, reason: string | null) {
    super(message)
    this.code = code
    this.reason = reason
  }
}

/** The AI designer: 2 proposals for an idea, or the next version of a design. Saved in «Mis diseños», never published. */
export async function askDesigner(body: { action: 'generate'; prompt: string } | { action: 'refine'; designId: string; prompt: string }): Promise<MenuDesign[]> {
  const { data, error } = await supabase.functions.invoke<{ designs: MenuDesign[] }>('dk-menu-designer', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    const payload = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null
    throw new DesignerError(payload?.message ?? 'La IA no pudo diseñar esta vez. Intenta de nuevo o usa el editor visual.', payload?.error ?? 'DESIGN_FAILED', payload?.reason ?? null)
  }
  return data?.designs ?? []
}
