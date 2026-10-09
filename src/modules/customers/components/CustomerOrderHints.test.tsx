// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ADR 0044: taking an order, what NOT to serve comes first; nothing to say, nothing shown.
const state = vi.hoisted(() => ({ detail: null as unknown, profile: null as unknown }))
vi.mock('../hooks/useCustomers', () => ({ useCustomerDetail: () => ({ data: state.detail }) }))
vi.mock('../hooks/useCustomerProfile', () => ({ useCustomerProfile: () => ({ data: state.profile }) }))

const { CustomerOrderHints } = await import('./CustomerOrderHints')

const pref = (id: string, kind: string, name: string, active = true) => ({ id, kind, name, active, productId: null, ingredientId: null, label: null, note: null, createdAt: '' })
afterEach(cleanup)

describe('what to know while taking the order', () => {
  it('dislikes and diet first, then favourites and active recommendations; preferred and company marked', () => {
    state.detail = { type: 'company', contactName: 'Marta Ruiz', preferred: true, preferredNote: 'Convenio corporativo' }
    state.profile = {
      preferences: [pref('p1', 'favorite_dish', 'Hamburguesa Clásica'), pref('p2', 'disliked_ingredient', 'cebolla'), pref('p3', 'dietary', 'Sin gluten'), pref('p4', 'disliked_ingredient', 'pepino', false)],
      recommendations: [
        { id: 'r1', title: 'Probar la sopa del día', productName: null, status: 'active', reason: null },
        { id: 'r2', title: 'Antigua', productName: null, status: 'dismissed', reason: null },
      ],
    }
    render(<CustomerOrderHints customerId="c1" />)
    const text = screen.getByRole('region', { name: 'Lo que debes saber de este cliente' }).textContent ?? ''
    expect(text.indexOf('Sin cebolla')).toBeLessThan(text.indexOf('Hamburguesa Clásica'))
    expect(text).toContain('Sin gluten')
    expect(text).toContain('Probar la sopa del día')
    expect(text).not.toContain('pepino')
    expect(text).not.toContain('Antigua')
    expect(text).toContain('Preferencial')
    expect(text).toContain('Convenio corporativo')
    expect(text).toContain('contacto: Marta Ruiz')
  })

  it('a plain customer with nothing noted: nothing is shown', () => {
    state.detail = { type: 'person', preferred: false }
    state.profile = { preferences: [], recommendations: [] }
    const { container } = render(<CustomerOrderHints customerId="c2" />)
    expect(container.textContent).toBe('')
  })
})
