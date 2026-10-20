import { describe, expect, it } from 'vitest'
import { whatsappLink } from '@/shared/utils/whatsapp'
import type { PublicMenu, PublicMenuItem } from '../types'
import { addLine, availabilityLabel, byCategory, cartIssues, cartStorageKey, cartTotals, formatHour, lineKey, lineUnitPrice, maxQuantity, openLabel, pruneOldCarts, quantityOf, readCart, replaceLine, setLineQuantity, setNote, setQuantity, shareText, writeCart } from './cart'

// ADR 0052: the cart does the same arithmetic as the server and says what changed.
const item = (over: Partial<PublicMenuItem>): PublicMenuItem => ({
  id: 'sopa', name: 'Sopa', description: null, categoryId: 'c1', category: 'Sopas', categoryOrder: 1, price: 5000, regularPrice: 6000,
  imagePath: null, images: [], availableFrom: null, availableUntil: null, remaining: null, availability: 'available', ...over,
})
const menu: Pick<PublicMenu, 'items' | 'ordering'> = {
  items: [item({}), item({ id: 'postre', name: 'Postre', category: 'Postres', categoryOrder: 2, price: 4000, regularPrice: null, remaining: 2 })],
  ordering: { enabled: true, delivery: true, pickup: true, deliveryFee: 3000, minOrder: 8000, paymentMethods: ['Efectivo'], transferInstructions: null, autoConfirm: true },
}

describe('cart', () => {
  it('adds, changes and removes lines, never above what is left', () => {
    let lines = setQuantity([], menu.items[0], 2)
    lines = setQuantity(lines, menu.items[1], 5)
    expect(lines).toEqual([
      { productId: 'sopa', quantity: 2, note: '' },
      { productId: 'postre', quantity: 2, note: '' },
    ])
    lines = setNote(lines, 'sopa', 'sin cilantro')
    expect(lines[0].note).toBe('sin cilantro')
    expect(setQuantity(lines, menu.items[0], 0)).toEqual([{ productId: 'postre', quantity: 2, note: '' }])
    expect(maxQuantity({ remaining: null })).toBe(50)
  })

  it('totals: subtotal, delivery only when delivered, and what is missing for the minimum', () => {
    const lines = [{ productId: 'sopa', quantity: 1, note: '' }]
    expect(cartTotals(lines, menu, 'delivery')).toEqual({ units: 1, subtotal: 5000, deliveryFee: 3000, total: 8000, belowMinimum: 3000 })
    expect(cartTotals([...lines, { productId: 'postre', quantity: 1, note: '' }], menu, 'pickup')).toMatchObject({ subtotal: 9000, deliveryFee: 0, total: 9000, belowMinimum: 0 })
  })

  it('says what changed since it went into the cart', () => {
    const lines = [
      { productId: 'sopa', quantity: 1, note: '' },
      { productId: 'postre', quantity: 2, note: '' },
      { productId: 'viejo', quantity: 1, note: '' },
    ]
    const items = [item({ availability: 'sold_out' }), item({ id: 'postre', name: 'Postre', remaining: 1 })]
    expect(cartIssues(lines, items).map((i) => i.message)).toEqual(['Sopa: Agotado', 'De Postre solo quedan 1', 'Ya no está en el menú de hoy'])
  })
})

describe('labels', () => {
  it('hours and availability in plain words', () => {
    expect(formatHour('12:30')).toBe('12:30 p. m.')
    expect(formatHour('09:05')).toBe('9:05 a. m.')
    expect(availabilityLabel(item({ availability: 'later', availableFrom: '12:00' }))).toBe('Desde las 12:00 p. m.')
    expect(availabilityLabel(item({ availability: 'sold_out' }))).toBe('Agotado')
    expect(availabilityLabel(item({ remaining: 1 }))).toBe('¡Queda 1!')
    expect(availabilityLabel(item({ remaining: 3 }))).toBe('Quedan 3')
    expect(availabilityLabel(item({}))).toBeNull()
  })

  it('open or closed, from the kitchen hours', () => {
    expect(openLabel({ state: 'open', closes_at: '2026-10-11T21:00:00' })).toEqual({ open: true, text: 'Abierto · cierra a las 9:00 p. m.' })
    expect(openLabel({ state: 'closed', opens_at: '2026-10-12T11:00:00' })).toEqual({ open: false, text: 'Cerrado · abre a las 11:00 a. m.' })
    expect(openLabel({ state: 'unconfigured' })).toEqual({ open: null, text: '' })
  })

  it('categories in the planner order', () => {
    expect(byCategory([menu.items[1], menu.items[0]]).map((g) => g.category)).toEqual(['Sopas', 'Postres'])
  })

  it('the message to share: today’s dishes and the link', () => {
    const text = shareText({ business: { name: 'Sopa donde Carmen' } as PublicMenu['business'], items: menu.items }, 'https://quanela.com/menu/x')
    expect(text).toBe('🍽️ Menú de hoy en Sopa donde Carmen\n• Sopa — $5.000\n• Postre — $4.000\n\nPide aquí: https://quanela.com/menu/x')
    expect(whatsappLink('+57 300 123 4567', 'Hola')).toBe('https://wa.me/573001234567?text=Hola')
    expect(whatsappLink(null, 'a b')).toBe('https://wa.me/?text=a%20b')
  })
})

// ADR 0059: configurable dishes — two ways of the same dish are two lines; the extras count; the limit counts every line.
describe('cart with options', () => {
  const corr = item({
    id: 'corr', name: 'Corrientazo', price: 18000, regularPrice: null, remaining: 3,
    groups: [
      { id: 'prot', name: 'Proteína', minSelect: 1, maxSelect: 1, allowRepeat: false, options: [
        { id: 'pollo', name: 'Pollo', pricing: 'included', price: 0, isDefault: true, available: true },
        { id: 'res', name: 'Res', pricing: 'extra', price: 3000, isDefault: false, available: true },
      ] },
      { id: 'acomp', name: 'Acompañantes', minSelect: 0, maxSelect: 3, allowRepeat: true, options: [
        { id: 'pata', name: 'Patacones', pricing: 'extra', price: 2000, isDefault: false, available: false },
      ] },
    ],
  })
  const withCorr = { ...menu, items: [...menu.items, corr] }

  it('the same choice joins its line, another choice is another line; prices include extras', () => {
    let lines = addLine([], corr, [{ optionId: 'res', quantity: 1 }, { optionId: 'pata', quantity: 2 }], 1)
    lines = addLine(lines, corr, [{ optionId: 'pata', quantity: 2 }, { optionId: 'res', quantity: 1 }], 1)
    lines = addLine(lines, corr, [{ optionId: 'pollo', quantity: 1 }], 1)
    expect(lines.map((l) => [lineKey(l), l.quantity])).toEqual([
      ['corr:patax2,resx1', 2],
      ['corr:pollox1', 1],
    ])
    expect(lineUnitPrice(corr, lines[0])).toBe(25000)
    expect(cartTotals(lines, withCorr, null).subtotal).toBe(2 * 25000 + 18000)
    expect(quantityOf(lines, 'corr')).toBe(3)
  })

  it('the dish limit counts every line; a line changes or goes by its key', () => {
    let lines = addLine([], corr, [{ optionId: 'res', quantity: 1 }], 2)
    lines = addLine(lines, corr, [{ optionId: 'pollo', quantity: 1 }], 5)
    expect(quantityOf(lines, 'corr')).toBe(3)
    lines = setLineQuantity(lines, 'corr:resx1', corr, 0)
    expect(lines.map(lineKey)).toEqual(['corr:pollox1'])
    lines = replaceLine(lines, 'corr:pollox1', corr, [{ optionId: 'res', quantity: 1 }], 1)
    expect(lines.map((l) => [lineKey(l), l.quantity])).toEqual([['corr:resx1', 1]])
  })

  it('an option that ran out since it went into the cart is said', () => {
    const lines = addLine([], corr, [{ optionId: 'pata', quantity: 1 }, { optionId: 'pollo', quantity: 1 }], 1)
    expect(cartIssues(lines, withCorr.items).map((i) => i.message)).toEqual(['Corrientazo: se agotó «Patacones»'])
  })
})

/** A Storage backed by a Map (the test runs without a browser). */
function memoryStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  }
}

// ADR 0071: carts of previous days do not pile up in the browser.
describe('cart storage', () => {
  const line = { productId: 'sopa', quantity: 1, note: '' }

  it('reading or writing removes the carts of previous days, of any menu', () => {
    const storage = memoryStorage({
      'quanela:cart:sopa:2026-10-10': '[]',
      'quanela:cart:otro:2026-09-30': '[]',
      'quanela:cart:otro:2026-10-11': JSON.stringify([line]),
      'dk-appearance': '{}',
    })
    expect(readCart('sopa', '2026-10-11', storage)).toEqual([])
    expect(Array.from({ length: storage.length }, (_, i) => storage.key(i))).toEqual(['quanela:cart:otro:2026-10-11', 'dk-appearance'])
    writeCart('sopa', '2026-10-12', [line], storage)
    expect(storage.getItem('quanela:cart:otro:2026-10-11')).toBeNull()
    expect(readCart('sopa', '2026-10-12', storage)).toEqual([line])
    expect(storage.getItem('dk-appearance')).toBe('{}')
  })

  it('an empty cart is removed; a broken one reads as empty', () => {
    const storage = memoryStorage({ [cartStorageKey('sopa', '2026-10-11')]: '{broken' })
    expect(readCart('sopa', '2026-10-11', storage)).toEqual([])
    writeCart('sopa', '2026-10-11', [], storage)
    expect(storage.length).toBe(0)
  })

  it('a blocked storage (private window) never throws', () => {
    const blocked = { get length(): number { throw new Error('SecurityError') }, getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('SecurityError') } } as unknown as Storage
    expect(() => pruneOldCarts('2026-10-11', blocked)).not.toThrow()
    expect(readCart('sopa', '2026-10-11', blocked)).toEqual([])
    expect(() => writeCart('sopa', '2026-10-11', [line], blocked)).not.toThrow()
  })
})
