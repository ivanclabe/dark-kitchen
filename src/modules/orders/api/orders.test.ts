import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
const { mapOrder } = await import('./orders')

// ADR 0020: one mapping of the order for every view (Pedidos, Cocina, Despacho, Dashboard, Clientes).
const row = {
  id: 'o1',
  order_number: 1015,
  customer_id: 'c1',
  status: 'DESPACHADO' as const,
  channel: 'WHATSAPP' as const,
  subtotal: 30000,
  discount: 0,
  delivery_fee: 5000,
  total: 35000,
  payment_method: 'efectivo',
  notes: null,
  requires_review: false,
  created_at: '2026-10-01T15:00:00Z',
  updated_at: '2026-10-01T15:40:00Z',
  dk_customers: { full_name: 'Ana Ruiz', address: 'Calle 1', phone: '300' },
  dk_kitchen_tickets: [{ priority: 1 }],
  dk_deliveries: [{ status: 'EN_RUTA' as const, rider_id: 'r1', dispatched_at: '2026-10-01T15:35:00Z', delivered_at: null, dk_delivery_riders: { full_name: 'Moto' } }],
  dk_order_items: [
    { id: 'i2', product_id: 'p2', quantity: 1, unit_price: 10000, line_total: 10000, observation: null, kitchen_status: 'LISTO' as const, created_at: '2026-10-01T15:01:00Z', dk_products: [{ name: 'Papas' }] },
    { id: 'i1', product_id: 'p1', quantity: 1, unit_price: 20000, line_total: 20000, observation: 'Sin cebolla', kitchen_status: 'LISTO' as const, created_at: '2026-10-01T15:00:30Z', dk_products: { name: 'Hamburguesa' } },
  ],
}

describe('mapOrder', () => {
  it('reads one-to-one embeds whether they come as an object or an array', () => {
    const o = mapOrder(row)
    expect(o.customerName).toBe('Ana Ruiz')
    expect(o.customerAddress).toBe('Calle 1')
    expect(o.priority).toBe(1)
    expect(o.delivery).toEqual({ status: 'EN_RUTA', riderId: 'r1', riderName: 'Moto', dispatchedAt: '2026-10-01T15:35:00Z', deliveredAt: null })
  })

  it('keeps the items in the order they were added, with their dish', () => {
    expect(mapOrder(row).items.map((i) => i.productName)).toEqual(['Hamburguesa', 'Papas'])
  })

  it('a rider without customers.view still gets a usable order', () => {
    const o = mapOrder({ ...row, dk_customers: null, dk_kitchen_tickets: null, dk_deliveries: null, dk_order_items: [], total: null })
    expect(o.customerName).toBe('—')
    expect(o.customerAddress).toBeNull()
    expect(o.priority).toBe(0)
    expect(o.delivery).toBeNull()
    expect(o.total).toBe(0)
  })
})
