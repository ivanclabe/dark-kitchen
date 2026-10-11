// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicMenu } from '../types'

// ADR 0052: from the menu to a real order — add, cart, the short form, and the tracking page.
const state = vi.hoisted(() => ({ menu: null as unknown, place: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../api/publicMenu', async () => {
  const actual = await vi.importActual<typeof import('../api/publicMenu')>('../api/publicMenu')
  return { ...actual, getPublicMenu: () => Promise.resolve(state.menu), placePublicOrder: state.place, getOrderStatus: () => Promise.resolve(null) }
})

const { PublicMenuPage } = await import('./PublicMenuPage')
const { PlaceOrderError } = await import('../api/publicMenu')

const menu: PublicMenu = {
  found: true,
  business: { name: 'Sopa donde Carmen', slug: 'sopa', iconKey: null, cuisine: null, tagline: 'Sopas caseras', whatsapp: '+573001112233', timezone: 'America/Bogota', currency: 'COP', message: null, openState: { state: 'open', closes_at: '2026-10-11T21:00:00' } },
  ordering: { enabled: true, delivery: true, pickup: true, deliveryFee: 3000, minOrder: 0, paymentMethods: ['Efectivo', 'Transferencia'], transferInstructions: 'Nequi 300', autoConfirm: true },
  today: '2026-10-11',
  items: [
    { id: 'p1', name: 'Sopa', description: 'Del día', categoryId: 'c1', category: 'Sopas', categoryOrder: 1, price: 5000, regularPrice: 6000, imagePath: null, images: [], availableFrom: null, availableUntil: null, remaining: null, availability: 'available' },
    { id: 'p2', name: 'Jugo', description: null, categoryId: null, category: 'Otros', categoryOrder: 2, price: 4000, regularPrice: null, imagePath: null, images: [], availableFrom: '15:00', availableUntil: null, remaining: null, availability: 'later' },
  ],
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/menu/sopa']}>
        <Routes>
          <Route path="/menu/:slug" element={<PublicMenuPage />} />
          <Route path="/menu/:slug/pedido/:token" element={<p>Seguimiento</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.menu = menu
  state.place.mockReset()
  localStorage.clear()
})
afterEach(cleanup)

describe('Menú público (ADR 0052)', () => {
  it('shows the business, open state, categories, promo price and what is not available yet', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Sopa donde Carmen' })).toBeTruthy()
    expect(screen.getByText('Abierto · cierra a las 9:00 p. m.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sopas' })).toBeTruthy()
    expect(screen.getByText('$6.000')).toBeTruthy()
    expect(screen.getByText('Desde las 3:00 p. m.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Agregar Jugo' })).toBeNull()
  })

  it('a real order: cart with note and totals, the form, server result → tracking', async () => {
    state.place.mockResolvedValue({ orderNumber: 1001, token: 'tok-1', status: 'CONFIRMADO', confirmed: true, repeated: false })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Sopa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro Sopa' }))
    fireEvent.click(screen.getByRole('button', { name: /Ver pedido · 2/ }))
    fireEvent.change(screen.getByLabelText('Nota para Sopa'), { target: { value: 'sin cilantro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(/Tu celular/), { target: { value: '300 111 2233' } })
    fireEvent.change(screen.getByLabelText('Dirección de entrega'), { target: { value: 'Calle 10 # 20-30' } })
    // 2 × 5.000 + 3.000 of delivery.
    fireEvent.click(screen.getByRole('button', { name: 'Hacer pedido · $13.000' }))
    await waitFor(() => expect(screen.getByText('Seguimiento')).toBeTruthy())
    const [slug, input] = state.place.mock.calls[0]
    expect(slug).toBe('sopa')
    expect(input).toMatchObject({
      customer: { name: 'Ana', phone: '300 111 2233' },
      fulfillment: 'delivery',
      address: 'Calle 10 # 20-30',
      paymentMethod: 'Efectivo',
      items: [{ productId: 'p1', quantity: 2, note: 'sin cilantro' }],
      website: '',
    })
    expect(input.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('if a dish sold out meanwhile, it says so and goes back to the cart', async () => {
    state.place.mockRejectedValue(new PlaceOrderError('«Sopa» no está disponible en este momento', 'unavailable', 'p1'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Sopa' }))
    fireEvent.click(screen.getByRole('button', { name: /Ver pedido/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByLabelText('Recoger'))
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(/Tu celular/), { target: { value: '3001112233' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hacer pedido · $5.000' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/no está disponible/)
    expect(screen.getByRole('heading', { name: 'Tu pedido' })).toBeTruthy()
  })

  it('without orders, the cart is sent by WhatsApp to the business', async () => {
    state.menu = { ...menu, ordering: { ...menu.ordering, enabled: false } }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Sopa' }))
    fireEvent.click(screen.getByRole('button', { name: /Ver pedido/ }))
    const link = screen.getByRole('link', { name: 'Pedir por WhatsApp' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573001112233\?text=.*Sopa/)
  })

  it('an unpublished menu says so', async () => {
    state.menu = null
    renderPage()
    expect(await screen.findByText('Este menú no está disponible')).toBeTruthy()
  })
})

describe('Menú público con diseño (ADR 0053)', () => {
  it('applies the published design: template, colors and only its two fonts', async () => {
    state.menu = { ...menu, theme: { template: 'classic', colors: { primary: '#123456' } } }
    const { container } = renderPage()
    await screen.findByRole('heading', { name: 'Sopa donde Carmen' })
    const root = container.querySelector('[data-template]') as HTMLElement
    expect(root.dataset.template).toBe('classic')
    expect(root.style.getPropertyValue('--pm-primary')).toBe('#123456')
    expect(document.querySelector('link[data-pm-fonts*="Playfair+Display"]')).toBeTruthy()
    // Same content and logic as before: the classic menu has no photos but the price and the button.
    expect(screen.getByText('$5.000')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agregar Sopa' })).toBeTruthy()
  })

  it('without a design it keeps the previous look', async () => {
    const { container } = renderPage()
    await screen.findByRole('heading', { name: 'Sopa donde Carmen' })
    expect((container.querySelector('[data-template]') as HTMLElement).style.getPropertyValue('--pm-bg')).toBe('#FAFAF9')
  })
})
