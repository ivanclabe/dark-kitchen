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

// ADR 0058: a modern page that looks finished without dish photos, with the business's own images.
describe('Renewed canvas (ADR 0058)', () => {
  it('a dish without a photo has no empty placeholder: only real photos are drawn', () => {
    const { container } = draw({ template: 'modern' })
    const images = [...container.querySelectorAll('img')]
    expect(images).toHaveLength(1)
    expect(images[0].getAttribute('src')).toContain('kitchens/k/products/p1.webp')
    expect(screen.getByRole('heading', { name: 'Jugo' })).toBeTruthy()
  })

  it('the info strip says what matters before ordering: open, delivery and its fee, pickup, minimum', () => {
    const theme = resolveTheme({ template: 'fresh' })
    const withDelivery = { ...menu, ordering: { ...menu.ordering, delivery: true, deliveryFee: 4000, minOrder: 15000 } }
    render(
      <ThemeRoot theme={theme}>
        <PublicMenuView slug="sopa" menu={withDelivery} theme={theme} />
      </ThemeRoot>,
    )
    const strip = within(screen.getByRole('list', { name: 'Información del pedido' }))
    expect(strip.getByText('Abierto · cierra a las 9:00 p. m.')).toBeTruthy()
    expect(strip.getByText('Domicilio $4.000')).toBeTruthy()
    expect(strip.getByText('Para recoger')).toBeTruthy()
    expect(strip.getByText('Mínimo $15.000')).toBeTruthy()
  })

  it('a special price is marked «Oferta» next to the regular one, and each category says how many dishes it has', () => {
    draw({ template: 'elegant' })
    expect(screen.getByText('Oferta')).toBeTruthy()
    expect(screen.getAllByText('1 plato').length).toBe(2)
  })

  it('the logo replaces the account icon and the header image works with any header style', () => {
    const { container } = draw({
      template: 'elegant',
      header: { logo: 'kitchens/k/branding/logo.webp', cover: 'kitchens/k/branding/portada.webp', coverPosition: 'top' },
    })
    const header = container.querySelector('header') as HTMLElement
    expect(header.querySelector('img')?.getAttribute('src')).toContain('kitchens/k/branding/logo.webp')
    const backdrop = header.querySelector('[style*="branding/portada.webp"]') as HTMLElement
    expect(backdrop).toBeTruthy()
    expect(backdrop.style.backgroundPosition).toBe('center top')
  })

  it('the add button is a round «+» that becomes «− n +»; the cart bar says how many and how much', () => {
    draw({ template: 'modern' })
    const add = screen.getByRole('button', { name: 'Agregar Sopa' })
    expect(add.textContent).toBe('')
    fireEvent.click(add)
    expect(screen.getByRole('button', { name: 'Quitar un Sopa' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver pedido · 1 · $5.000' })).toBeTruthy()
  })
})
