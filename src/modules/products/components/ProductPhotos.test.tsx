// @vitest-environment jsdom
import { ToastProvider } from '@/shared/ui/Toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductImage } from '../api/products'

// ADR 0018: a dish with no photo, one photo and two photos.
const state = vi.hoisted(() => ({ images: [] as ProductImage[] }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/useProducts', () => {
  const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  return {
    useProductImages: () => ({ data: state.images, isLoading: false }),
    useSaveProductImage: () => idle,
    useDeleteProductImage: () => idle,
    useSetMainProductImage: () => idle,
  }
})
const { ProductPhotos } = await import('./ProductPhotos')

const img = (position: 1 | 2): ProductImage => ({ id: `i${position}`, productId: 'p1', path: `kitchens/k/products/p1/${position}.webp`, position, width: 1600, height: 1200 })

function show(canEdit = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <ProductPhotos productId="p1" productName="Ajiaco" canEdit={canEdit} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('dish photos (ADR 0018)', () => {
  afterEach(cleanup)

  it('no photo: add the main one; the second waits for it', () => {
    state.images = []
    show()
    expect(screen.getByRole('button', { name: /Agregar foto/ })).toBeTruthy()
    expect((screen.getByRole('button', { name: /Segunda foto/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Primero la principal')).toBeTruthy()
  })

  it('one photo: it is the main one; the second can be added', () => {
    state.images = [img(1)]
    show()
    expect(screen.getByText('Principal')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Segunda foto/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getAllByRole('button', { name: 'Quitar' })).toHaveLength(1)
  })

  it('two photos: the second can become main; both can be replaced or removed', () => {
    state.images = [img(1), img(2)]
    show()
    expect(document.querySelectorAll('img')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Hacer principal' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Reemplazar' })).toHaveLength(2)
  })

  it('without permission: photos are shown, nothing can change', () => {
    state.images = [img(1)]
    show(false)
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull()
    expect(screen.getByText('Sin foto')).toBeTruthy()
  })
})
