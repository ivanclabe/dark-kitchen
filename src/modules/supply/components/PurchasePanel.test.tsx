// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Purchase } from '../types'

// ADR 0030 D5: purchases load 50 at a time with «Cargar más», and say when not all are loaded.
const state = vi.hoisted(() => ({ limits: [] as number[], total: 0, importUsable: true, pending: [] as unknown[], discard: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ can: () => true, feature: (key: string) => (key === 'invoice_import' ? { usable: state.importUsable } : null) }),
}))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))
vi.mock('../hooks/useInvoiceImport', () => ({
  usePendingImports: () => ({ data: state.pending }),
  useDiscardImport: () => ({ mutate: state.discard }),
}))
vi.mock('../hooks/usePurchases', () => ({
  PURCHASES_PAGE: 50,
  usePurchases: (limit: number) => {
    state.limits.push(limit)
    const rows: Purchase[] = Array.from({ length: Math.min(limit, state.total) }, (_, i) => ({
      id: `p${i}`, supplierId: 's1', supplierName: `Proveedor ${i}`, invoiceNumber: `F-${i}`, invoiceDate: '2026-10-01', status: 'CONFIRMADA', subtotal: 1000, tax: 0, total: 1000, notes: null,
    }))
    return { data: { rows, hasMore: state.total > limit }, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }
  },
}))

const { PurchasePanel } = await import('./PurchasePanel')

beforeEach(() => {
  state.limits = []
  state.importUsable = true
  state.pending = []
  state.discard.mockReset()
})
afterEach(cleanup)

describe('Compras paginadas (ADR 0030)', () => {
  it('loads the 50 most recent, warns, and «Cargar más» asks for the next 50', () => {
    state.total = 120
    render(<PurchasePanel selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} onImport={vi.fn()} />)
    expect(state.limits.at(-1)).toBe(50)
    expect(screen.getAllByText(/^Proveedor /)).toHaveLength(50)
    expect(screen.getByText(/Mostrando las 50 compras más recientes/)).toBeTruthy()
    // The counts would lie with part of the list: they are hidden while there is more.
    expect(screen.getByRole('button', { name: 'Todas' }).textContent).toBe('Todas')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(state.limits.at(-1)).toBe(100)
  })

  it('with everything loaded, no notice and the counts are back', () => {
    state.total = 3
    render(<PurchasePanel selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} onImport={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull()
    expect(screen.getByRole('button', { name: /Todas/ }).textContent).toBe('Todas3')
  })
})

describe('Importar desde factura (ADR 0049)', () => {
  it('«Nueva» offers the manual purchase and the import', () => {
    state.total = 1
    const onCreate = vi.fn()
    const onImport = vi.fn()
    render(<PurchasePanel selectedId={null} onSelect={vi.fn()} onCreate={onCreate} onImport={onImport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nueva' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Importar desde factura' }))
    expect(onImport).toHaveBeenCalledWith()
    fireEvent.click(screen.getByRole('button', { name: 'Nueva' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manual' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('without the AI feature, «Nueva» is the manual purchase as before', () => {
    state.total = 1
    state.importUsable = false
    const onCreate = vi.fn()
    render(<PurchasePanel selectedId={null} onSelect={vi.fn()} onCreate={onCreate} onImport={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nueva' }))
    expect(onCreate).toHaveBeenCalled()
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('invoices read and not saved wait in «Por revisar»', () => {
    state.total = 1
    state.pending = [
      { id: 'i1', status: 'LISTA', fileName: 'f.jpg', createdAt: '2026-10-10T10:00:00Z', extraction: { supplier: { name: 'Frutas El Sol' }, invoice: { number: 'FE-1' } } },
      { id: 'i2', status: 'ERROR', fileName: 'borrosa.jpg', createdAt: '2026-10-10T10:00:00Z', extraction: null },
    ]
    render(<PurchasePanel selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} onImport={vi.fn()} />)
    expect(screen.getByText('Por revisar (2)')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Frutas El Sol/ }).getAttribute('href')).toBe('/supply/compras/importar/i1')
    expect(screen.getByText(/No se pudo leer/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrosa.jpg' }))
    expect(state.discard).toHaveBeenCalledWith('i2')
  })

  it('a file dropped on the list is imported; another kind of file is refused', () => {
    state.total = 1
    const onImport = vi.fn()
    const { container } = render(<PurchasePanel selectedId={null} onSelect={vi.fn()} onCreate={vi.fn()} onImport={onImport} />)
    const root = container.firstElementChild as HTMLElement
    const pdf = new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' })
    fireEvent.drop(root, { dataTransfer: { files: [pdf], types: ['Files'] } })
    expect(onImport).toHaveBeenCalledWith(pdf)
    fireEvent.drop(root, { dataTransfer: { files: [new File(['x'], 'notas.txt', { type: 'text/plain' })], types: ['Files'] } })
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toMatch(/Sube una foto/)
  })
})
