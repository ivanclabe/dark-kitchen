// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { Extraction, InvoiceMatch } from '../types/invoiceImport'

// ADR 0049: the review proposes, the person decides; nothing is saved until she says so.
const state = vi.hoisted(() => ({ perms: new Set<string>(), save: vi.fn(), match: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: (p: string) => state.perms.has(p) }) }))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))
vi.mock('./InvoicePreview', () => ({ InvoicePreview: () => null }))
vi.mock('@/shared/hooks/useUnits', () => ({
  useUnits: () => ({
    data: [
      { id: 'u-g', code: 'g', name: 'Gramo', unitType: 'WEIGHT', factorToBase: 1 },
      { id: 'u-kg', code: 'kg', name: 'Kilogramo', unitType: 'WEIGHT', factorToBase: 1000 },
      { id: 'u-un', code: 'unidad', name: 'Unidad', unitType: 'UNIT', factorToBase: 1 },
      { id: 'u-caja', code: 'caja', name: 'Caja', unitType: 'UNIT', factorToBase: 1 },
    ],
  }),
}))
vi.mock('../hooks/useIngredients', () => ({
  useIngredients: () => ({
    data: [
      { id: 'tom', code: 'TOM', name: 'Tomate', baseUnitCode: 'g', avgCost: 4, active: true },
      { id: 'egg', code: 'HUEVO', name: 'Huevo', baseUnitCode: 'unidad', avgCost: 500, active: true },
    ],
  }),
}))
vi.mock('../hooks/useSuppliers', () => ({ useSuppliers: () => ({ data: [{ id: 'sup', name: 'Frutas El Sol S.A.S.', taxId: '900123456-7', active: true }] }) }))
vi.mock('../hooks/useInvoiceImport', () => ({
  useIngredientPurchaseUnits: () => ({ data: [] }),
  useSavePurchaseFromImport: () => ({ mutateAsync: state.save, isPending: false }),
  useDiscardImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../api/invoiceImport', () => ({ matchInvoice: state.match, InvoiceImportError: class extends Error {} }))

const { InvoiceReview } = await import('./InvoiceReview')

const extraction: Extraction = {
  isInvoice: true,
  supplier: { name: 'FRUTAS EL SOL SAS', taxId: '9001234567', phone: null, email: null, address: null },
  invoice: { number: 'FE-1001', date: '2026-10-09', currency: 'COP', subtotal: 63000, tax: 0, total: 63000 },
  confidence: { supplier: 'alta', number: 'alta', date: 'alta', totals: 'alta' },
  lines: [
    { text: 'TOMATE CHONTO X KG', code: null, quantity: 2, unit: 'KG', unitPrice: 4000, lineTotal: 8000, confidence: 'alta' },
    { text: 'Huevos AA', code: null, quantity: 30, unit: 'Und', unitPrice: 500, lineTotal: 15000, confidence: 'alta' },
    { text: 'Tomate caja', code: null, quantity: 1, unit: 'CAJA', unitPrice: 40000, lineTotal: 40000, confidence: 'alta' },
  ],
  warnings: ['La foto está un poco borrosa'],
}
const tomato = { ingredientId: 'tom', name: 'Tomate', code: 'TOM', active: true, baseUnitCode: 'g', baseUnitType: 'WEIGHT' as const, avgCost: 4, purchaseUnits: [], learnedUnitCode: null }
const match: InvoiceMatch = {
  suppliers: [{ id: 'sup', name: 'Frutas El Sol S.A.S.', taxId: '900123456-7', active: true, score: 1, reason: 'tax_id', taxIdDiffers: false }],
  supplierId: 'sup',
  supplierStrong: true,
  duplicateInvoice: null,
  lines: [
    { index: 0, suggestions: [{ ...tomato, score: 1, reason: 'learned', learnedUnitCode: 'kg' }] },
    { index: 1, suggestions: [{ ...tomato, ingredientId: 'egg', name: 'Huevo', code: 'HUEVO', baseUnitCode: 'unidad', baseUnitType: 'UNIT', avgCost: 500, score: 0.6, reason: 'similar' }] },
    { index: 2, suggestions: [{ ...tomato, score: 0.95, reason: 'name' }] },
  ],
}
const invoice = { id: 'imp1', status: 'LISTA' as const, fileName: 'f.jpg', filePath: 'k/f.jpg', mimeType: 'image/jpeg', extraction, error: null, purchaseId: null, createdAt: '2026-10-10T10:00:00Z' }

function renderReview(onSaved = vi.fn()) {
  render(
    <ToastProvider>
      <InvoiceReview invoice={invoice} match={match} onSaved={onSaved} onDiscarded={vi.fn()} />
    </ToastProvider>,
  )
  return onSaved
}

beforeEach(() => {
  state.perms = new Set(['purchasing.create', 'purchasing.confirm', 'suppliers.edit', 'inventory.create'])
  state.save.mockReset().mockResolvedValue({ purchaseId: 'p1', supplierCreated: false, ingredientsCreated: 0 })
  state.match.mockReset()
})
afterEach(cleanup)

describe('Revisión de la factura (ADR 0049)', () => {
  it('shows the supplier found and why, the warnings, and what is missing', () => {
    renderReview()
    expect(screen.getByText('Frutas El Sol S.A.S.')).toBeTruthy()
    expect(screen.getByText(/Sugerido: Mismo NIT/)).toBeTruthy()
    expect(screen.getByText('La foto está un poco borrosa')).toBeTruthy()
    // Line 2 is only 60 % alike: suggested, not chosen. Line 3 is a box: how much does it bring?
    expect(screen.getByText(/Sugerencias:/)).toBeTruthy()
    expect(screen.getByText('¿Cuántos g trae 1 caja?')).toBeTruthy()
    expect(screen.getByText(/Para guardar: Faltan completar 2 líneas/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Guardar borrador' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('once everything is reviewed it saves a draft with what the person decided', async () => {
    const onSaved = renderReview()
    fireEvent.click(screen.getByRole('button', { name: /Huevo · Parecido 60 %/ }))
    fireEvent.change(screen.getByLabelText('Cuántos g trae 1 caja'), { target: { value: '12000' } })
    fireEvent.blur(screen.getByLabelText('Cuántos g trae 1 caja'))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Guardar borrador' }) as HTMLButtonElement).disabled).toBe(false))
    expect(screen.getByText(/Cuadra con el subtotal de la factura/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('p1'))
    const { importId, payload, confirm } = state.save.mock.calls[0][0]
    expect(importId).toBe('imp1')
    expect(confirm).toBe(false)
    expect(payload.supplier).toEqual({ id: 'sup' })
    expect(payload.lines.map((l: { ingredient: { id: string }; unitCode: string; factor: number | null }) => [l.ingredient.id, l.unitCode, l.factor])).toEqual([
      ['tom', 'kg', null],
      ['egg', 'unidad', null],
      ['tom', 'caja', 12000],
    ])
  })

  it('an ignored line is not sent, and without purchasing.confirm there is no «Guardar y confirmar»', async () => {
    state.perms.delete('purchasing.confirm')
    renderReview()
    expect(screen.queryByRole('button', { name: 'Guardar y confirmar' })).toBeNull()
    const ignore = screen.getAllByRole('button', { name: 'Ignorar' })
    fireEvent.click(ignore[2])
    fireEvent.click(screen.getByRole('button', { name: /Huevo · Parecido 60 %/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await waitFor(() => expect(state.save).toHaveBeenCalled())
    expect(state.save.mock.calls[0][0].payload.lines).toHaveLength(2)
  })
})
