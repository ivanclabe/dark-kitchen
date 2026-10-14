// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveTheme } from '../lib/themes'
import type { PublicMenu } from '../types'

// ADR 0059: a configurable dish in the public menu — its options, the price as they change, a summary, and the cart.
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
const { PublicMenuView } = await import('./MenuView')
const { ThemeRoot } = await import('./ThemeRoot')

const menu: PublicMenu = {
  found: true,
  business: { name: 'Brasa & Pan', slug: 'brasa', iconKey: null, cuisine: null, tagline: null, whatsapp: null, timezone: 'America/Bogota', currency: 'COP', message: null, openState: { state: 'unconfigured' } },
  ordering: { enabled: true, delivery: false, pickup: true, deliveryFee: 0, minOrder: 0, paymentMethods: ['Efectivo'], transferInstructions: null, autoConfirm: true },
  today: '2026-10-13',
  items: [
    {
      id: 'corr', name: 'Corrientazo', description: 'El almuerzo de la casa', categoryId: 'c1', category: 'Almuerzos', categoryOrder: 1, price: 18000, regularPrice: null,
      imagePath: null, images: [], availableFrom: null, availableUntil: null, remaining: null, availability: 'available',
      groups: [
        { id: 'sopa', name: 'Sopa', minSelect: 1, maxSelect: 1, allowRepeat: false, options: [{ id: 'sancocho', name: 'Sancocho', pricing: 'included', price: 0, isDefault: true, available: true }] },
        { id: 'prot', name: 'Proteína', minSelect: 1, maxSelect: 1, allowRepeat: false, options: [
          { id: 'pollo', name: 'Pollo', pricing: 'included', price: 0, isDefault: true, available: true },
          { id: 'res', name: 'Res', pricing: 'extra', price: 3000, isDefault: false, available: true },
        ] },
        { id: 'beb', name: 'Bebida', minSelect: 1, maxSelect: 1, allowRepeat: false, options: [
          { id: 'limo', name: 'Limonada', pricing: 'included', price: 0, isDefault: false, available: true },
          { id: 'gas', name: 'Gaseosa', pricing: 'included', price: 0, isDefault: false, available: false },
        ] },
        { id: 'acomp', name: 'Acompañantes', minSelect: 0, maxSelect: 3, allowRepeat: true, options: [
          { id: 'pata', name: 'Patacones', pricing: 'extra', price: 2000, isDefault: false, available: true },
          { id: 'yuca', name: 'Yuca', pricing: 'courtesy', price: 0, isDefault: false, available: true },
        ] },
      ],
    },
  ],
}

function draw() {
  const theme = resolveTheme({ template: 'modern' })
  return render(
    <ThemeRoot theme={theme}>
      <PublicMenuView slug="brasa" menu={menu} theme={theme} mode="preview" />
    </ThemeRoot>,
  )
}

afterEach(cleanup)

describe('Plato configurable (ADR 0059)', () => {
  it('the card says what is chosen; «+» opens the dish with its rules and prices', () => {
    draw()
    expect(screen.getByText('Elige: Sopa · Proteína · Bebida · Acompañantes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Corrientazo' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Corrientazo' }))
    expect(sheet.getAllByText('Obligatorio · elige 1')).toHaveLength(3)
    expect(sheet.getByText('Opcional · hasta 3')).toBeTruthy()
    expect(sheet.getByText('+$3.000')).toBeTruthy()
    expect(sheet.getByText('Cortesía')).toBeTruthy()
    expect(sheet.getByText('Agotado')).toBeTruthy()
    // The defaults are chosen; the drink is still missing.
    expect((sheet.getByRole('radio', { name: /Pollo/ }) as HTMLInputElement).checked).toBe(true)
    expect(sheet.getByText('Elige: Bebida')).toBeTruthy()
    expect((sheet.getByRole('button', { name: /^Agregar\s*\$/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((sheet.getByRole('radio', { name: /Gaseosa/ }) as HTMLInputElement).disabled).toBe(true)
  })

  it('beef + lemonade + patacones ×2 + yuca, 2 units: the summary and the button say $50.000; the cart keeps the choice', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Corrientazo' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Corrientazo' }))
    fireEvent.click(sheet.getByRole('radio', { name: /Res/ }))
    fireEvent.click(sheet.getByRole('radio', { name: /Limonada/ }))
    fireEvent.click(sheet.getByRole('button', { name: 'Agregar Patacones' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Agregar Patacones' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Agregar Yuca' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Uno más' }))
    const summary = within(sheet.getByRole('region', { name: 'Resumen' }))
    expect(summary.getByText('Proteína: Res')).toBeTruthy()
    expect(summary.getByText('+$3.000')).toBeTruthy()
    expect(summary.getByText('Acompañantes: Patacones ×2')).toBeTruthy()
    expect(summary.getByText('+$4.000')).toBeTruthy()
    expect(summary.getByText('2 × $25.000')).toBeTruthy()
    const add = sheet.getByRole('button', { name: /^Agregar\s*\$/ })
    expect(add.textContent).toContain('$50.000')
    fireEvent.click(add)
    expect(screen.queryByRole('dialog', { name: 'Corrientazo' })).toBeNull()
    expect(screen.getByLabelText('2 en tu pedido')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver pedido · 2 · $50.000' }))
    const cart = within(screen.getByRole('dialog', { name: 'Tu pedido' }))
    expect(cart.getByText('Sancocho · Res · Limonada · Patacones ×2 · Yuca')).toBeTruthy()
    fireEvent.click(cart.getByRole('button', { name: 'Editar Corrientazo' }))
    expect(within(screen.getByRole('dialog', { name: 'Corrientazo' })).getByRole('button', { name: /Guardar cambios/ })).toBeTruthy()
  })
})
