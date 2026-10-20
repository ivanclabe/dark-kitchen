/**
 * ADR 0052 — the cart of the public menu, pure: lines, totals (the same
 * arithmetic the server does), what changed against today's menu, and the
 * labels the customer reads. The server recalculates everything anyway.
 */
import { fromPayload, lineSignature, unitPrice } from '@/shared/composition/composition'
import { formatMoney } from '@/shared/utils/format'
import type { CartLine, Fulfillment, OpenState, PublicMenu, PublicMenuItem } from '../types'

export const MAX_UNITS_PER_LINE = 50
export const MAX_LINES = 30

/** The cart lives in this browser, per account and per day (yesterday's cart is not today's). */
export const cartStorageKey = (slug: string, today: string) => `quanela:cart:${slug}:${today}`

const CART_KEY = /^quanela:cart:.+:(\d{4}-\d{2}-\d{2})$/

/** ADR 0071: carts of previous days (any menu) leave the browser; they are never read again. */
export function pruneOldCarts(today: string, storage?: Storage): void {
  try {
    const store = storage ?? localStorage
    const stale: string[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      const day = key ? CART_KEY.exec(key)?.[1] : undefined
      if (key && day && day < today) stale.push(key)
    }
    for (const key of stale) store.removeItem(key)
  } catch {
    // A private window may block storage: nothing to clean.
  }
}

/** Today's cart of a menu, as saved in this browser (an unreadable one is an empty cart). */
export function readCart(slug: string, today: string, storage?: Storage): CartLine[] {
  pruneOldCarts(today, storage)
  try {
    const raw = (storage ?? localStorage).getItem(cartStorageKey(slug, today))
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : []
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l.productId === 'string' && l.quantity > 0) : []
  } catch {
    return []
  }
}

/** Saves today's cart (an empty one is removed). */
export function writeCart(slug: string, today: string, lines: CartLine[], storage?: Storage): void {
  pruneOldCarts(today, storage)
  try {
    const store = storage ?? localStorage
    const key = cartStorageKey(slug, today)
    if (lines.length) store.setItem(key, JSON.stringify(lines))
    else store.removeItem(key)
  } catch {
    // A private window may block storage: the cart still works in memory.
  }
}

/** How many units of a dish can still be asked for. */
export function maxQuantity(item: Pick<PublicMenuItem, 'remaining'>): number {
  return Math.min(MAX_UNITS_PER_LINE, item.remaining ?? MAX_UNITS_PER_LINE)
}

/** A line's identity: the dish and what was chosen (ADR 0059; a plain dish is just its id). */
export const lineKey = (line: Pick<CartLine, 'productId' | 'options'>) => lineSignature(line.productId, line.options)

/** Units of a dish across all its lines (limits count them all). */
export function quantityOf(lines: CartLine[], productId: string): number {
  return lines.filter((l) => l.productId === productId).reduce((sum, l) => sum + l.quantity, 0)
}

/** Sets the quantity of one line (0 removes it); the dish's limit counts its other lines too. */
export function setLineQuantity(lines: CartLine[], key: string, item: Pick<PublicMenuItem, 'id' | 'remaining'>, quantity: number): CartLine[] {
  const others = lines.filter((l) => l.productId === item.id && lineKey(l) !== key).reduce((sum, l) => sum + l.quantity, 0)
  const q = Math.max(0, Math.min(Math.floor(quantity), maxQuantity(item) - others))
  if (q === 0) return lines.filter((l) => lineKey(l) !== key)
  return lines.map((l) => (lineKey(l) === key ? { ...l, quantity: q } : l))
}

/** A plain dish (no options): its single line. */
export function setQuantity(lines: CartLine[], item: Pick<PublicMenuItem, 'id' | 'remaining'>, quantity: number): CartLine[] {
  if (lines.some((l) => lineKey(l) === item.id)) return setLineQuantity(lines, item.id, item, quantity)
  return addLine(lines, item, [], quantity)
}

/** A dish as chosen: joins the line chosen the same way, or starts a new one. */
export function addLine(lines: CartLine[], item: Pick<PublicMenuItem, 'id' | 'remaining'>, options: { optionId: string; quantity: number }[], quantity: number): CartLine[] {
  const key = lineSignature(item.id, options)
  const existing = lines.find((l) => lineKey(l) === key)
  if (existing) return setLineQuantity(lines, key, item, existing.quantity + quantity)
  const room = maxQuantity(item) - quantityOf(lines, item.id)
  const q = Math.max(0, Math.min(Math.floor(quantity), room))
  if (q === 0 || lines.length >= MAX_LINES) return lines
  return [...lines, { productId: item.id, quantity: q, note: '', ...(options.length ? { options } : {}) }]
}

/** Replaces a line with the dish chosen again (editing from the cart). */
export function replaceLine(lines: CartLine[], key: string, item: Pick<PublicMenuItem, 'id' | 'remaining'>, options: { optionId: string; quantity: number }[], quantity: number): CartLine[] {
  const old = lines.find((l) => lineKey(l) === key)
  const rest = lines.filter((l) => lineKey(l) !== key)
  const next = addLine(rest, item, options, quantity)
  const at = lines.findIndex((l) => lineKey(l) === key)
  if (!old || at < 0) return next
  // Keep the line where it was, with its note.
  const added = next.find((l) => lineKey(l) === lineSignature(item.id, options))
  if (!added) return next
  const ordered = next.filter((l) => l !== added)
  ordered.splice(Math.min(at, ordered.length), 0, { ...added, note: added.note || old.note })
  return ordered
}

/** The note of a line (`key` = lineKey; a plain dish's key is its id). */
export function setNote(lines: CartLine[], key: string, note: string): CartLine[] {
  return lines.map((l) => (lineKey(l) === key ? { ...l, note: note.slice(0, 200) } : l))
}

/** What one unit of a line costs: the dish's price of today plus its extras. */
export function lineUnitPrice(item: Pick<PublicMenuItem, 'price' | 'groups'>, line: Pick<CartLine, 'options'>): number {
  return unitPrice(item.price, item.groups ?? [], fromPayload(line.options))
}

export interface CartTotals {
  units: number
  subtotal: number
  deliveryFee: number
  total: number
  /** What is missing to reach the minimum order (0 when reached). */
  belowMinimum: number
}

export function cartTotals(lines: CartLine[], menu: Pick<PublicMenu, 'items' | 'ordering'>, fulfillment: Fulfillment | null): CartTotals {
  const byId = new Map(menu.items.map((i) => [i.id, i]))
  let units = 0
  let subtotal = 0
  for (const l of lines) {
    const item = byId.get(l.productId)
    if (!item) continue
    units += l.quantity
    subtotal += lineUnitPrice(item, l) * l.quantity
  }
  const deliveryFee = fulfillment === 'delivery' && units > 0 ? menu.ordering.deliveryFee : 0
  return { units, subtotal, deliveryFee, total: subtotal + deliveryFee, belowMinimum: Math.max(0, menu.ordering.minOrder - subtotal) }
}

/** What changed since the dish went into the cart (it ran out, its hour ended, fewer are left). */
export function cartIssues(lines: CartLine[], items: PublicMenuItem[]): { productId: string; message: string }[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const issues: { productId: string; message: string }[] = []
  for (const l of lines) {
    const item = byId.get(l.productId)
    if (!item) issues.push({ productId: l.productId, message: 'Ya no está en el menú de hoy' })
    else if (item.availability !== 'available') issues.push({ productId: l.productId, message: `${item.name}: ${availabilityLabel(item) ?? 'no disponible'}` })
    else if (item.remaining !== null && quantityOf(lines, item.id) > item.remaining) issues.push({ productId: l.productId, message: `De ${item.name} solo quedan ${item.remaining}` })
    else {
      // ADR 0059: an option that ran out (or left the dish) since it went into the cart.
      const options = (item.groups ?? []).flatMap((g) => g.options)
      for (const o of l.options ?? []) {
        const option = options.find((x) => x.id === o.optionId)
        if (!option) issues.push({ productId: l.productId, message: `${item.name}: una opción ya no está disponible` })
        else if (option.available === false) issues.push({ productId: l.productId, message: `${item.name}: se agotó «${option.name}»` })
      }
    }
  }
  return issues
}

/** «HH:MM» → «12:30 p. m.» */
export function formatHour(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  const suffix = h < 12 ? 'a. m.' : 'p. m.'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

/** What the customer reads under a dish, when it is not simply available. */
export function availabilityLabel(item: Pick<PublicMenuItem, 'availability' | 'availableFrom' | 'availableUntil' | 'remaining'>): string | null {
  switch (item.availability) {
    case 'sold_out':
      return 'Agotado'
    case 'later':
      return `Desde las ${formatHour(item.availableFrom)}`
    case 'ended':
      return 'Ya no está disponible hoy'
    default:
      if (item.remaining !== null && item.remaining <= 5) return item.remaining === 1 ? '¡Queda 1!' : `Quedan ${item.remaining}`
      if (item.availableUntil) return `Hasta las ${formatHour(item.availableUntil)}`
      return null
  }
}

/** «Abierto · cierra a las 9:00 p. m.» / «Cerrado · abre a las 11:00 a. m.» */
export function openLabel(open: OpenState): { open: boolean | null; text: string } {
  const at = (iso?: string | null) => (iso ? formatHour(iso.slice(11, 16)) : '')
  if (open.state === 'open') return { open: true, text: open.closes_at ? `Abierto · cierra a las ${at(open.closes_at)}` : 'Abierto' }
  if (open.state === 'closed') return { open: false, text: open.opens_at ? `Cerrado · abre a las ${at(open.opens_at)}` : 'Cerrado por hoy' }
  return { open: null, text: '' }
}

/** Dishes by category, in the planner's order. */
export function byCategory(items: PublicMenuItem[]): { category: string; items: PublicMenuItem[] }[] {
  const groups = new Map<string, { order: number; items: PublicMenuItem[] }>()
  for (const item of items) {
    const g = groups.get(item.category) ?? { order: item.categoryOrder, items: [] }
    g.items.push(item)
    groups.set(item.category, g)
  }
  return [...groups.entries()].sort((a, b) => a[1].order - b[1].order).map(([category, g]) => ({ category, items: g.items }))
}

/** The message to share the menu by WhatsApp: today's dishes with their prices and the link. */
export function shareText(menu: Pick<PublicMenu, 'business' | 'items'>, url: string): string {
  const dishes = menu.items
    .filter((i) => i.availability === 'available' || i.availability === 'later')
    .slice(0, 12)
    .map((i) => `• ${i.name} — ${formatMoney(i.price)}`)
  return [`🍽️ Menú de hoy en ${menu.business.name}`, ...dishes, '', `Pide aquí: ${url}`].join('\n')
}

/** The public address of a menu, from wherever the app runs (quanela.com in production). */
export function publicMenuUrl(slug: string, origin: string = typeof window === 'undefined' ? '' : window.location.origin): string {
  const root = (import.meta.env.VITE_TENANT_ROOT_DOMAIN as string | undefined)?.trim()
  const base = root && root !== 'localhost' ? `https://${root}` : origin
  return `${base}/menu/${slug}`
}
