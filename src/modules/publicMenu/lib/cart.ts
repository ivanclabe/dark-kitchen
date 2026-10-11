/**
 * ADR 0052 — the cart of the public menu, pure: lines, totals (the same
 * arithmetic the server does), what changed against today's menu, and the
 * labels the customer reads. The server recalculates everything anyway.
 */
import { formatMoney } from '@/shared/utils/format'
import type { CartLine, Fulfillment, OpenState, PublicMenu, PublicMenuItem } from '../types'

export const MAX_UNITS_PER_LINE = 50
export const MAX_LINES = 30

/** The cart lives in this browser, per account and per day (yesterday's cart is not today's). */
export const cartStorageKey = (slug: string, today: string) => `quanela:cart:${slug}:${today}`

/** How many units of a dish can still be asked for. */
export function maxQuantity(item: Pick<PublicMenuItem, 'remaining'>): number {
  return Math.min(MAX_UNITS_PER_LINE, item.remaining ?? MAX_UNITS_PER_LINE)
}

export function setQuantity(lines: CartLine[], item: Pick<PublicMenuItem, 'id' | 'remaining'>, quantity: number): CartLine[] {
  const q = Math.max(0, Math.min(Math.floor(quantity), maxQuantity(item)))
  const existing = lines.find((l) => l.productId === item.id)
  if (q === 0) return lines.filter((l) => l.productId !== item.id)
  if (existing) return lines.map((l) => (l.productId === item.id ? { ...l, quantity: q } : l))
  if (lines.length >= MAX_LINES) return lines
  return [...lines, { productId: item.id, quantity: q, note: '' }]
}

export function setNote(lines: CartLine[], productId: string, note: string): CartLine[] {
  return lines.map((l) => (l.productId === productId ? { ...l, note: note.slice(0, 200) } : l))
}

export function quantityOf(lines: CartLine[], productId: string): number {
  return lines.find((l) => l.productId === productId)?.quantity ?? 0
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
    subtotal += item.price * l.quantity
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
    else if (item.remaining !== null && l.quantity > item.remaining) issues.push({ productId: l.productId, message: `De ${item.name} solo quedan ${item.remaining}` })
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
