// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { StorefrontData, StorefrontState } from '../api/storefront'

// ADR 0046: Quanela Consumer as a module — Resumen, Perfil del negocio, Platos.
const state = vi.hoisted(() => ({ data: null as unknown, saved: [] as unknown[], savedProducts: [] as unknown[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ kitchen: { id: 'k1', slug: 'centro' }, path: (to: string) => `/k/centro${to}` }) }))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={`/k/centro${to}`} {...rest}>{children}</a> }))
vi.mock('@/modules/products/components/ProductImage', () => ({ ProductThumb: ({ name }: { name: string }) => <span data-testid="thumb">{name}</span> }))
vi.mock('../api/storefront', async (original) => ({
  ...(await original<typeof import('../api/storefront')>()),
  fetchStorefront: async () => state.data,
  saveStorefront: async (d: StorefrontData) => void state.saved.push(d),
  saveStorefrontProducts: async (items: unknown[]) => void state.savedProducts.push(items),
}))

const { ConsumerPage } = await import('./ConsumerPage')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')

const product = (id: string, name: string, over: object = {}) => ({
  id, name, category: 'Platos', price: 25000, image_path: 'x.webp', has_description: true, has_recipe: true, published: false, dietary_tags: [], show_ingredients: false, ...over,
})
const base = (): StorefrontState => ({
  storefront: {
    published: false, public_slug: 'sopa-donde-carmen', display_name: 'Sopa donde Carmen', tagline: null, cuisine: 'traditional',
    latitude: null, longitude: null, whatsapp_phone: null, share_metrics: false, published_at: null,
  },
  defaults: { display_name: 'Sopa donde Carmen', public_slug: 'sopa-donde-carmen', cuisine: 'traditional' },
  account: { name: 'Sopa donde Carmen', slug: 'sopa-donde-carmen', cuisine: 'traditional', organization_cuisine: null },
  open_state: { state: 'open' },
  metrics: { prep_minutes: null, prep_sample: 0, response_minutes: null, response_sample: 0, delivery_minutes: null, completion_rate: null, completion_sample: 0 },
  products: [product('p1', 'Ajiaco', { published: true }), product('p2', 'Bandeja Paisa', { image_path: null }), product('p3', 'Changua', { has_description: false })],
})

function renderAt(path = '/k/centro/consumer') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/k/centro/consumer" element={<ConsumerPage />} />
            <Route path="/k/centro/consumer/:section" element={<ConsumerPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.data = base()
  state.saved = []
  state.savedProducts = []
})
afterEach(cleanup)

describe('Quanela Consumer (ADR 0046)', () => {
  it('three sections; Resumen says it is not published, what is missing, and that the app is not out yet', async () => {
    renderAt()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumen', 'Perfil del negocio', 'Platos'])
    expect(await screen.findByRole('heading', { name: 'No publicado' })).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/La app para clientes todavía no está disponible/)
    expect(screen.getByText('Ubicación')).toBeTruthy()
    expect(screen.getByText(/Sin ella, Quanela no puede decir a qué distancia estás/)).toBeTruthy()
  })

  it('publishing asks first, saying how many dishes customers will see, and keeps the profile as it is', async () => {
    const user = userEvent.setup()
    renderAt()
    await user.click(await screen.findByRole('button', { name: 'Publicar' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/verán «Sopa donde Carmen» con 1 plato/)
    await user.click(within(dialog).getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(state.saved).toHaveLength(1))
    expect(state.saved[0]).toMatchObject({ published: true })
    // ADR 0047: the name, the address and the cuisine are the account's — never sent from here.
    expect(state.saved[0]).not.toHaveProperty('display_name')
    expect(state.saved[0]).not.toHaveProperty('public_slug')
    expect(state.saved[0]).not.toHaveProperty('cuisine')
  })

  it('without a published dish, Publicar is not offered', async () => {
    const data = base()
    data.products = data.products.map((p) => ({ ...p, published: false }))
    state.data = data
    renderAt()
    expect(((await screen.findByRole('button', { name: 'Publicar' })) as HTMLButtonElement).disabled).toBe(true)
  })

  it('published: it says since when, and pausing is immediate', async () => {
    const data = base()
    data.storefront = { ...data.storefront!, published: true, published_at: '2026-10-01T15:00:00Z' }
    state.data = data
    const user = userEvent.setup()
    renderAt()
    expect(await screen.findByRole('heading', { name: 'Publicado' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Pausar publicación' }))
    await waitFor(() => expect(state.saved[0]).toMatchObject({ published: false }))
  })

  it('Platos: filters by what is missing, links it to Catálogo, and publishes several at once', async () => {
    const user = userEvent.setup()
    renderAt('/k/centro/consumer/platos')
    await user.click(await screen.findByRole('button', { name: /Sin foto/ }))
    expect(screen.getAllByTestId('thumb').map((t) => t.textContent)).toEqual(['Bandeja Paisa'])
    expect(screen.getByRole('link', { name: /sin foto/ }).getAttribute('href')).toBe('/k/centro/menu-planner?plato=p2')
    await user.click(screen.getByRole('button', { name: /^Todos/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Bandeja Paisa' }))
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Changua' }))
    await user.click(screen.getByRole('button', { name: 'Publicar' }))
    await user.click(screen.getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(state.savedProducts).toHaveLength(1))
    expect((state.savedProducts[0] as { product_id: string; published: boolean }[]).map((i) => [i.product_id, i.published])).toEqual([
      ['p2', true],
      ['p3', true],
    ])
  })

  it('Platos before any profile: saving creates the publication, NOT published, then the dishes', async () => {
    state.data = { ...base(), storefront: null }
    const user = userEvent.setup()
    renderAt('/k/centro/consumer/platos')
    await user.click(await screen.findByRole('switch', { name: 'Publicar Changua' }))
    await user.click(screen.getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(state.savedProducts).toHaveLength(1))
    expect(state.saved).toEqual([{ published: false, tagline: null, latitude: null, longitude: null, whatsapp_phone: null, share_metrics: false }])
  })

  it('Perfil shows the account\'s identity (not editable here) and edits only the short phrase', async () => {
    renderAt('/k/centro/consumer/perfil')
    expect(await screen.findByRole('link', { name: /Cambiar en General/ })).toBeTruthy()
    expect(screen.getByText('sopa-donde-carmen')).toBeTruthy()
    expect(screen.getByText('Típica')).toBeTruthy()
    expect(screen.queryByLabelText(/Nombre para los clientes/)).toBeNull()
    expect(screen.getByLabelText('Frase corta')).toBeTruthy()
  })
})
