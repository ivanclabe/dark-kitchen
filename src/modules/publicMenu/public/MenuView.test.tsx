// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveTheme, TEMPLATE_IDS, type ThemeDesign } from '../lib/themes'
import type { PublicMenu } from '../types'

// ADR 0053: one tree, drawn by the theme. The content (prices, availability) never changes with it.
const place = vi.fn()
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../api/publicMenu', async () => {
  const actual = await vi.importActual<typeof import('../api/publicMenu')>('../api/publicMenu')
  return { ...actual, placePublicOrder: place }
})
const { PublicMenuView } = await import('./MenuView')
const { ThemeRoot } = await import('./ThemeRoot')

const menu: PublicMenu = {
  found: true,
  business: { name: 'Sopa donde Carmen', slug: 'sopa', iconKey: null, cuisine: null, tagline: 'Sopas caseras', whatsapp: null, timezone: 'America/Bogota', currency: 'COP', message: null, openState: { state: 'open', closes_at: '2026-10-11T21:00:00' } },
  ordering: { enabled: true, delivery: false, pickup: true, deliveryFee: 0, minOrder: 0, paymentMethods: ['Efectivo'], transferInstructions: null, autoConfirm: true },
  today: '2026-10-11',
  items: [
    { id: 'p1', name: 'Sopa', description: 'Del día', categoryId: 'c1', category: 'Sopas', categoryOrder: 1, price: 5000, regularPrice: 6000, imagePath: 'kitchens/k/products/p1.webp', images: [], availableFrom: null, availableUntil: null, remaining: 2, availability: 'available' },
    { id: 'p2', name: 'Jugo', description: 'Natural', categoryId: null, category: 'Bebidas', categoryOrder: 2, price: 4000, regularPrice: null, imagePath: null, images: [], availableFrom: null, availableUntil: null, remaining: 0, availability: 'sold_out' },
  ],
}

function draw(design: ThemeDesign | null, mode: 'live' | 'preview' = 'live') {
  const theme = resolveTheme(design)
  return render(
    <ThemeRoot theme={theme}>
      <PublicMenuView slug="sopa" menu={menu} theme={theme} mode={mode} />
    </ThemeRoot>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  place.mockReset()
})

describe('PublicMenuView (ADR 0053)', () => {
  it.each(TEMPLATE_IDS)('template %s shows the same content: dishes, prices, availability and the add button', (template) => {
    const { container } = draw({ template })
    expect(container.querySelector(`[data-template="${template}"]`)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Sopa donde Carmen' })).toBeTruthy()
    expect(screen.getByText('$5.000')).toBeTruthy()
    expect(screen.getByText('$6.000')).toBeTruthy()
    expect(screen.getByText('Agotado')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agregar Sopa' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Agregar Jugo' })).toBeNull()
  })

  it('hides photos and descriptions when the design says so (classic: no photos)', () => {
    const { container } = draw({ template: 'classic' })
    expect(container.querySelector('img')).toBeNull()
    cleanup()
    const other = draw({ template: 'modern', cards: { description: 'hide' } })
    expect(other.container.querySelector('img')).toBeTruthy()
    expect(screen.queryByText('Del día')).toBeNull()
  })

  it('navigation follows the design: chips, tabs, a select or none', () => {
    draw({ template: 'modern', nav: 'select' })
    expect(screen.getByRole('combobox', { name: 'Ir a la categoría' })).toBeTruthy()
    cleanup()
    draw({ template: 'modern', nav: 'none' })
    expect(screen.queryByRole('navigation', { name: 'Categorías' })).toBeNull()
    cleanup()
    draw({ template: 'elegant' })
    expect(within(screen.getByRole('navigation', { name: 'Categorías' })).getByRole('button', { name: 'Bebidas' })).toBeTruthy()
  })

  it('the cart keeps its limits in any layout (remaining = 2)', () => {
    draw({ template: 'fresh' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Sopa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro Sopa' }))
    expect((screen.getByRole('button', { name: 'Agregar otro Sopa' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /Ver pedido · 2/ })).toBeTruthy()
  })

  it('in the preview the cart works but nothing is sent nor stored', () => {
    draw({ template: 'dark' }, 'preview')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Sopa' }))
    fireEvent.click(screen.getByRole('button', { name: /Ver pedido/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    const submit = screen.getByRole('button', { name: /Vista previa/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(submit)
    expect(place).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
})
