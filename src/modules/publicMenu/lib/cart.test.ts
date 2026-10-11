import { describe, expect, it } from 'vitest'
import { whatsappLink } from '@/shared/utils/whatsapp'
import type { PublicMenu, PublicMenuItem } from '../types'
import { availabilityLabel, byCategory, cartIssues, cartTotals, formatHour, maxQuantity, openLabel, setNote, setQuantity, shareText } from './cart'

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
