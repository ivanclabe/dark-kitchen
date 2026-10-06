// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { HelpLayout } from './HelpLayout'
import { HelpArticlePage } from './pages/HelpArticlePage'
import { HelpHomePage } from './pages/HelpHomePage'

const state = vi.hoisted(() => ({ session: null as object | null }))
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ session: state.session }) }))

afterEach(cleanup)

beforeAll(() => {
  window.scrollTo = vi.fn() as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/help" element={<HelpLayout />}>
          <Route index element={<HelpHomePage />} />
          <Route path=":section" element={<HelpArticlePage />} />
          <Route path=":section/:id" element={<HelpArticlePage />} />
        </Route>
        <Route path="/login" element={<p>login</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('public help center (ADR 0034)', () => {
  it('opens without a session: the start, the wiki menu and «Entrar»', () => {
    state.session = null
    renderAt('/help')
    expect(screen.getByRole('heading', { level: 1, name: '¿En qué te ayudamos?' })).toBeTruthy()
    const menu = screen.getByRole('navigation', { name: 'Secciones de la ayuda' })
    for (const title of ['Introducción', 'Primeros pasos', 'Pedidos', 'Cocina', 'Inventario', 'Reportes', 'Capturas anotadas', 'Preguntas frecuentes', 'Notas de versión']) {
      expect(within(menu).getByRole('button', { name: new RegExp(title) })).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe('/login')
  })

  it('shows an article with its steps, the link to the app and the related ones', () => {
    renderAt('/help/orders/register-payment')
    expect(screen.getByRole('heading', { level: 1, name: 'Registrar y anular pagos' })).toBeTruthy()
    expect(screen.getByText('Confirmar pago', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir en Quanela/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Artículos relacionados' })).toBeTruthy()
    // A screenshot not taken yet shows its placeholder, with its description for screen readers.
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
  })

  it('a section goes to its first article', () => {
    renderAt('/help/kitchen')
    expect(screen.getByRole('heading', { level: 1, name: 'Usar la vista Cocina' })).toBeTruthy()
  })

  it('an unknown article says so and offers the way back', () => {
    renderAt('/help/orders/no-existe')
    expect(screen.getByRole('heading', { name: 'No encontramos ese artículo' })).toBeTruthy()
  })

  it('searches as you type and opens the article chosen', () => {
    renderAt('/help')
    const [box] = screen.getAllByRole('combobox', { name: 'Buscar en el centro de ayuda' })
    fireEvent.change(box, { target: { value: 'registrar una compra' } })
    const first = screen.getAllByRole('option')[0]
    expect(first.textContent).toContain('Registrar una compra')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByRole('heading', { level: 1, name: 'Registrar una compra' })).toBeTruthy()
  })

  it('«Volver a Quanela» with a session', () => {
    state.session = {}
    renderAt('/help/faq/faq')
    expect(screen.getByRole('link', { name: 'Volver a Quanela' })).toBeTruthy()
  })
})
