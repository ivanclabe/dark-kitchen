// @vitest-environment jsdom
import { ToastProvider } from '@/shared/ui/Toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuDesign, PublicMenuSettings } from '../types'

// ADR 0053: the editor changes the preview instantly, saves a draft by itself and publishes only on request.
const api = vi.hoisted(() => ({
  saveDraft: vi.fn(), publish: vi.fn(), discard: vi.fn(), revert: vi.fn(), preview: vi.fn(),
  list: vi.fn(), ask: vi.fn(), use: vi.fn(), publishDesign: vi.fn(), save: vi.fn(), update: vi.fn(), remove: vi.fn(),
}))
const kitchen = vi.hoisted(() => ({ aiUsable: true }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ kitchen: { id: 'k1', name: 'Sopa donde Carmen' }, feature: (key: string) => (key === 'menu_designer' ? { usable: kitchen.aiUsable } : undefined) }),
}))
vi.mock('../api/publicMenu', async () => {
  const actual = await vi.importActual<typeof import('../api/publicMenu')>('../api/publicMenu')
  return {
    ...actual,
    getPublicMenuPreview: api.preview,
    saveThemeDraft: api.saveDraft,
    publishTheme: api.publish,
    discardThemeDraft: api.discard,
    revertTheme: api.revert,
    getPublicMenuSettings: () => Promise.resolve(settings),
    listDesigns: api.list,
    askDesigner: api.ask,
    applyDesignAsDraft: api.use,
    publishDesign: api.publishDesign,
    saveDesign: api.save,
    updateDesign: api.update,
    deleteDesign: api.remove,
  }
})
const { DesignTab } = await import('./DesignTab')

const settings: PublicMenuSettings = {
  slug: 'sopa', name: 'Sopa donde Carmen', iconKey: null, whatsapp: null, tagline: 'Sopas caseras', published: true, publishedAt: null,
  ordersEnabled: true, delivery: true, pickup: true, deliveryFee: 0, minOrder: 0, paymentMethods: ['Efectivo'], transferInstructions: null,
  autoConfirm: true, message: null, openState: { state: 'unconfigured' }, hasHours: false,
  theme: null, themeDraft: null, themePublishedAt: null, hasPreviousTheme: false,
}

function renderTab(s: PublicMenuSettings = settings, url = '/public-menu/design') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <DesignTab settings={s} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const previewRoot = () => screen.getByTestId('design-preview').querySelector('[data-template]') as HTMLElement

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.preview.mockResolvedValue(null)
  api.saveDraft.mockResolvedValue(undefined)
  api.publish.mockResolvedValue(undefined)
  api.list.mockResolvedValue([])
  api.use.mockResolvedValue({ backedUp: false })
  api.publishDesign.mockResolvedValue({ backedUp: false })
  kitchen.aiUsable = true
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DesignTab (ADR 0053)', () => {
  it('shows the six templates and example dishes when today is empty', async () => {
    renderTab()
    expect(await screen.findByText('Platos de ejemplo: hoy no hay menú en el planificador.')).toBeTruthy()
    for (const name of ['Moderna', 'Elegante', 'Artesanal', 'Dark premium', 'Fresca', 'Carta tradicional']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy()
    expect(screen.getByText('Igual al publicado')).toBeTruthy()
  })

  it('a template or a control changes the preview at once, and the draft saves itself', async () => {
    renderTab()
    await screen.findByTestId('design-preview')
    fireEvent.click(screen.getByRole('button', { name: /Carta tradicional/ }))
    expect(previewRoot().dataset.template).toBe('classic')
    expect(screen.getByText('Cambios sin publicar')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Navegación/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Desplegable' }))
    expect(screen.getByTestId('design-preview').querySelector('select[aria-label="Ir a la categoría"]')).toBeTruthy()

    await waitFor(() => expect(api.saveDraft).toHaveBeenCalled(), { timeout: 2000 })
    expect(api.saveDraft.mock.lastCall?.[0]).toEqual({ template: 'classic', nav: 'select' })
    expect(api.publish).not.toHaveBeenCalled()
  })

  it('warns about contrast and «Corregir» fixes it', async () => {
    renderTab()
    await screen.findByTestId('design-preview')
    fireEvent.change(screen.getByLabelText('Texto en hexadecimal'), { target: { value: '#F5F5F5' } })
    expect(screen.getAllByText(/se lee con dificultad/).length).toBeGreaterThan(0)
    for (const button of screen.getAllByRole('button', { name: 'Corregir' })) act(() => fireEvent.click(button))
    await waitFor(() => expect(screen.queryByText(/se lee con dificultad/)).toBeNull())
  })

  it('publishing saves the latest draft first, then publishes', async () => {
    renderTab()
    await screen.findByTestId('design-preview')
    fireEvent.click(screen.getByRole('button', { name: /Artesanal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar diseño' }))
    await waitFor(() => expect(api.publish).toHaveBeenCalledTimes(1))
    expect(api.saveDraft).toHaveBeenCalledWith({ template: 'artisan' }, expect.anything())
    expect(api.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(api.publish.mock.invocationCallOrder[0])
  })

  it('opens on the saved draft and offers to go back to the previous design', async () => {
    renderTab({ ...settings, theme: { template: 'dark' }, themeDraft: { template: 'fresh' }, hasPreviousTheme: true })
    await screen.findByTestId('design-preview')
    expect(previewRoot().dataset.template).toBe('fresh')
    expect(screen.getByText('Cambios sin publicar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Volver al anterior' })).toBeTruthy()
  })
})

const design = (id: string, extra: Partial<MenuDesign> = {}): MenuDesign => ({
  id, name: `Diseño ${id}`, design: { template: 'dark' }, source: 'ai', prompt: 'carta elegante, fondo negro y dorado', summary: 'Negro y dorado.',
  parentId: null, favorite: false, createdAt: '2026-10-11T12:00:00Z', lastPublishedAt: null, createdBy: 'Dueña', ...extra,
})

describe('Diseñador con IA y Mis diseños (ADR 0054)', () => {
  it('the AI designer only shows when the feature is usable', async () => {
    kitchen.aiUsable = false
    renderTab(settings, '/public-menu/design?view=ai')
    await screen.findByTestId('design-preview')
    expect(screen.queryByRole('tab', { name: /Diseñador con IA/ })).toBeNull()
    expect(screen.getByRole('tab', { name: /Editor visual/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('an idea gives two proposals with a real preview; nothing is used nor published', async () => {
    api.ask.mockResolvedValueOnce([design('a', { name: 'Noche dorada' }), design('b', { name: 'Clásica negra', design: { template: 'classic', colors: { background: '#111111', text: '#F5F1E8', surface: '#1A1A1A', price: '#D4A64A' } } })])
    renderTab(settings, '/public-menu/design?view=ai')
    fireEvent.change(await screen.findByLabelText('Cómo quieres tu menú'), { target: { value: 'diseña una carta elegante con fondo negro y detalles dorados' } })
    fireEvent.click(screen.getByRole('button', { name: 'Diseñar con IA' }))
    expect(await screen.findByRole('button', { name: /Noche dorada/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Clásica negra/ })).toBeTruthy()
    expect(api.ask.mock.calls[0][0]).toEqual({ action: 'generate', prompt: 'diseña una carta elegante con fondo negro y detalles dorados' })
    expect(previewRoot().dataset.template).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: /Clásica negra/ }))
    expect(previewRoot().dataset.template).toBe('classic')
    expect(api.use).not.toHaveBeenCalled()
    expect(api.publishDesign).not.toHaveBeenCalled()
    expect(api.saveDraft).not.toHaveBeenCalled()
  })

  it('asking for a change creates version 2 of the chosen design', async () => {
    api.ask.mockResolvedValueOnce([design('a', { name: 'Noche dorada' }), design('b')])
    api.ask.mockResolvedValueOnce([design('a2', { name: 'Noche dorada · más clara', parentId: 'a', design: { template: 'dark', colors: { background: '#2A2A30' } } })])
    renderTab(settings, '/public-menu/design?view=ai')
    fireEvent.click(await screen.findByRole('button', { name: 'Una carta elegante con fondo negro y detalles dorados' }))
    await screen.findByRole('button', { name: /Noche dorada/ })
    fireEvent.click(screen.getByRole('button', { name: 'Haz el fondo un poco más claro' }))
    await waitFor(() => expect(previewRoot().style.getPropertyValue('--pm-bg')).toBe('#2A2A30'))
    expect(api.ask.mock.calls[1][0]).toEqual({ action: 'refine', designId: 'a', prompt: 'Haz el fondo un poco más claro' })
    expect(screen.getByRole('button', { name: 'v2' }).getAttribute('aria-current')).toBe('true')
  })

  it('«Usar en el editor» and «Publicar» are explicit (publishing asks first)', async () => {
    api.ask.mockResolvedValue([design('a', { name: 'Noche dorada' }), design('b')])
    renderTab(settings, '/public-menu/design?view=ai')
    fireEvent.click(await screen.findByRole('button', { name: 'Fresco y colorido, para jugos y bowls' }))
    await screen.findByRole('button', { name: /Noche dorada/ })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar este diseño' }))
    expect(await screen.findByText('¿Publicar «Noche dorada»?')).toBeTruthy()
    expect(api.publishDesign).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(api.publishDesign).toHaveBeenCalledWith('a', expect.anything()))
    expect(api.publish).not.toHaveBeenCalled()
  })

  it('a quota or availability problem is explained, not hidden', async () => {
    const { DesignerError } = await import('../api/publicMenu')
    api.ask.mockRejectedValueOnce(new DesignerError('Llegaste al límite de IA de hoy. Puedes seguir con el editor visual.', 'NOT_ALLOWED', 'daily'))
    renderTab(settings, '/public-menu/design?view=ai')
    fireEvent.click(await screen.findByRole('button', { name: 'Carta tradicional de restaurante, sin fotos' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Llegaste al límite de IA de hoy')
  })

  it('Mis diseños: cards with origin, what is live, compare two and use one in the editor', async () => {
    api.list.mockResolvedValue([
      design('a', { name: 'Noche dorada' }),
      design('p', { name: 'Publicado el 10/10', source: 'published', design: { template: 'classic' }, lastPublishedAt: '2026-10-10T10:00:00Z', prompt: null }),
    ])
    renderTab({ ...settings, theme: { template: 'classic' }, themeDraft: { template: 'classic' } }, '/public-menu/design?view=library')
    const live = await screen.findByText('En línea')
    expect(live.closest('li')?.textContent).toContain('Publicado el 10/10')
    expect(screen.getByText('«carta elegante, fondo negro y dorado»')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Noche dorada' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Comparar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Publicado el 10/10' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Comparar' }))
    fireEvent.click(screen.getByRole('button', { name: /Comparar \(2\/2\)/ }))
    expect(await screen.findByText('Comparar diseños')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Noche dorada' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Usar en el editor' }))
    await waitFor(() => expect(api.use).toHaveBeenCalledWith('a', expect.anything()))
    expect(api.publishDesign).not.toHaveBeenCalled()
  })

  it('the editor can keep its design in Mis diseños without publishing', async () => {
    api.save.mockResolvedValue(design('e', { source: 'editor' }))
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar en Mis diseños' }))
    await waitFor(() => expect(api.save).toHaveBeenCalled())
    expect(api.save.mock.calls[0][0]).toBe('Moderna · editor')
    expect(api.publish).not.toHaveBeenCalled()
  })
})
