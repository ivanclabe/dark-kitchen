// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { Product } from '@/modules/products/types'

// ADR 0048: «Descuenta inventario» on the dish.
const state = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({ useActiveKitchen: () => ({ can: () => true }) }))
vi.mock('@/shared/kitchen/KitchenLink', () => ({ KitchenLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a> }))
vi.mock('@/modules/products/components/ProductPhotos', () => ({ ProductPhotos: () => null }))
vi.mock('@/modules/products/api/products', () => ({ saveProductImage: vi.fn() }))
vi.mock('@/modules/products/hooks/useProducts', () => {
  const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  return {
    useProductCategories: () => ({ data: [] }),
    useCreateProduct: () => ({ ...idle, mutateAsync: state.create }),
    useUpdateProduct: () => ({ ...idle, mutateAsync: state.update }),
    useSetSharedProductPrice: () => idle,
    useCreateProductCategory: () => idle,
    useSetProductActive: () => idle,
  }
})

const { DishFormDrawer } = await import('./DishFormDrawer')

const soda: Product = {
  id: 'p1',
  code: null,
  name: 'Gaseosa',
  description: null,
  categoryId: null,
  categoryName: null,
  price: 4000,
  imagePath: null,
  activeRecipeId: null,
  activeRecipeVersion: null,
  estimatedCost: 0,
  active: true,
  masterProductId: null,
  priceIsLocal: false,
  usesInventory: false,
}

function renderDrawer(product: Product | null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <DishFormDrawer product={product} open onClose={() => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.create.mockReset().mockResolvedValue({ id: 'new' })
  state.update.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('Descuenta inventario (ADR 0048)', () => {
  it('a new dish uses inventory unless it is turned off', async () => {
    renderDrawer(null)
    const toggle = screen.getByRole('switch', { name: 'Descuenta inventario' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.getByText(/Se vende sin receta y nunca reserva ni descuenta insumos/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Gaseosa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear plato' }))
    await waitFor(() => expect(state.create).toHaveBeenCalled())
    expect(state.create.mock.calls[0][0]).toMatchObject({ name: 'Gaseosa', usesInventory: false })
  })

  it('editing keeps what the dish has and can turn it back on', async () => {
    renderDrawer(soda)
    const toggle = screen.getByRole('switch', { name: 'Descuenta inventario' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(state.update).toHaveBeenCalled())
    expect(state.update.mock.calls[0][0]).toMatchObject({ id: 'p1', input: { usesInventory: true } })
  })

  it('a dish from a master menu cannot change it here', () => {
    renderDrawer({ ...soda, masterProductId: 'm1' })
    expect((screen.getByRole('switch', { name: 'Descuenta inventario' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Lo define el menú maestro/)).toBeTruthy()
  })
})
