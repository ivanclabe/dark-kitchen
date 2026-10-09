import { describe, expect, it } from 'vitest'
import type { StorefrontProduct, StorefrontState } from '../api/storefront'
import { dishFigures, filterDishes, readinessOf, sharedTimes } from './readiness'

// ADR 0046: what a business needs before customers see it, from what the database says.
const dish = (over: Partial<StorefrontProduct>): StorefrontProduct => ({
  id: Math.random().toString(36).slice(2),
  name: 'Hamburguesa Clásica',
  category: 'Hamburguesas',
  price: 25000,
  image_path: 'k/p/1.webp',
  has_description: true,
  has_recipe: true,
  published: true,
  dietary_tags: [],
  show_ingredients: false,
  ...over,
})
const metrics = { prep_minutes: null, prep_sample: 0, response_minutes: null, response_sample: 0, delivery_minutes: null, completion_rate: null, completion_sample: 0 }
const state = (over: Partial<StorefrontState> = {}): StorefrontState => ({
  storefront: {
    published: false, public_slug: 'sopa-donde-carmen', display_name: 'Sopa donde Carmen', tagline: null, cuisine: null,
    latitude: null, longitude: null, whatsapp_phone: null, share_metrics: false, published_at: null,
  },
  defaults: { display_name: 'Sopa donde Carmen', public_slug: 'sopa-donde-carmen', cuisine: null },
  account: { name: 'Sopa donde Carmen', slug: 'sopa-donde-carmen', cuisine: null, organization_cuisine: null },
  open_state: { state: 'unconfigured' },
  metrics,
  products: [dish({ published: false })],
  ...over,
})

describe('ready to publish', () => {
  it('without a published dish, publishing is not offered (the identity is the account\'s: always there)', () => {
    expect(readinessOf(state()).items.find((i) => i.id === 'identity')).toMatchObject({ done: true, required: true, fix: { path: '/settings/general' } })
    expect(readinessOf(state({ storefront: null })).canPublish).toBe(false)
    expect(readinessOf(state()).canPublish).toBe(false)
  })

  it('profile + one dish is enough; the rest are recommendations, each saying where it is fixed', () => {
    const r = readinessOf(state({ products: [dish({ image_path: null, has_description: false })] }))
    expect(r.canPublish).toBe(true)
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]))
    expect(byId.photos).toMatchObject({ done: false, required: false, detail: '0 de 1 publicados tienen foto.', fix: { section: 'platos' } })
    expect(byId.hours).toMatchObject({ done: false, fix: { path: '/operations?view=kitchen' } })
    expect(byId.location.fix).toEqual({ section: 'perfil' })
    // ADR 0047: the cuisine is chosen in Configuración → General.
    expect(byId.cuisine.fix).toEqual({ path: '/settings/general' })
  })

  it('the cuisine like the organization says so', () => {
    const r = readinessOf(state({ defaults: { display_name: 'X', public_slug: 'x-x', cuisine: 'traditional' }, account: { name: 'X', slug: 'x-x', cuisine: null, organization_cuisine: 'traditional' } }))
    expect(r.items.find((i) => i.id === 'cuisine')).toMatchObject({ done: true, detail: 'Típica (como el negocio)' })
  })

  it('a complete business has everything done', () => {
    const r = readinessOf(
      state({
        storefront: { ...state().storefront!, cuisine: 'burgers', tagline: 'Smash burgers', latitude: 4.6, longitude: -74.08, whatsapp_phone: '+573001234567' },
        account: { name: 'Sopa donde Carmen', slug: 'sopa-donde-carmen', cuisine: 'burgers', organization_cuisine: null },
        open_state: { state: 'open' },
        products: [dish({})],
      }),
    )
    expect(r.done).toBe(r.items.length)
    expect(r.items.find((i) => i.id === 'cuisine')?.detail).toBe('Hamburguesas')
  })
})

describe('the figures and the dishes list', () => {
  const products = [dish({ id: 'a', name: 'Arepa', category: 'Desayunos', image_path: null }), dish({ id: 'b', name: 'Bandeja Paisa', has_description: false, dietary_tags: ['spicy'] }), dish({ id: 'c', name: 'Café', published: false })]

  it('counts only the published ones for photo, description and tags', () => {
    expect(dishFigures(products)).toEqual({ active: 3, published: 2, withPhoto: 1, withDescription: 1, withTags: 1 })
  })

  it('filters by what is missing, by the draft state and by name or category', () => {
    const drafts = { c: { published: true } }
    expect(filterDishes(products, {}, 'no_photo', '').map((p) => p.id)).toEqual(['a'])
    expect(filterDishes(products, {}, 'no_description', '').map((p) => p.id)).toEqual(['b'])
    expect(filterDishes(products, drafts, 'hidden', '').map((p) => p.id)).toEqual([])
    expect(filterDishes(products, {}, 'all', 'desayu').map((p) => p.id)).toEqual(['a'])
  })

  it('shared times say only what is measured', () => {
    expect(sharedTimes(metrics)).toBeNull()
    expect(sharedTimes({ ...metrics, prep_minutes: 15, completion_rate: 0.92 })).toBe('preparación ~15 min · 92 % de pedidos cumplidos')
  })
})
