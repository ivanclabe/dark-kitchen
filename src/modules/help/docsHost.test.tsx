// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DOCS_ROUTES } from './routes'

// doc.quanela.com (ADR 0035).
vi.mock('@/shared/tenant/host', async (original) => ({
  ...(await original<typeof import('@/shared/tenant/host')>()),
  currentHost: () => ({ kind: 'docs' }),
  docsUrl: (path = '/') => `https://doc.quanela.com${path}`,
  rootUrl: (path = '/') => `https://quanela.com${path}`,
}))
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ session: null }) }))

afterEach(cleanup)
beforeAll(() => {
  window.scrollTo = vi.fn() as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
})

function open(path: string) {
  const router = createMemoryRouter(DOCS_ROUTES, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('the help center on doc.quanela.com', () => {
  it('lives at the root: the start and each article without /help', async () => {
    open('/')
    expect(await screen.findByRole('heading', { level: 1, name: '¿En qué te ayudamos?' })).toBeTruthy()
    for (const link of screen.getAllByRole('link', { name: 'Crear un pedido' })) expect(link.getAttribute('href')).toBe('/orders/create-order')
    expect(screen.getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe('https://quanela.com/login')
  })

  it('an article: links between articles without /help, «Abrir en Quanela» through the sign-in, its canonical address', async () => {
    open('/faq/faq')
    expect(await screen.findByRole('heading', { level: 1, name: 'Preguntas frecuentes' })).toBeTruthy()
    const inText = [...document.querySelectorAll<HTMLAnchorElement>('.help-prose a[data-help-link]')].map((a) => a.getAttribute('href'))
    expect(inText.length).toBeGreaterThan(0)
    expect(inText.every((h) => h?.startsWith('/') && !h.startsWith('/help/'))).toBe(true)
    cleanup()
    open('/orders/register-payment')
    expect(await screen.findByRole('heading', { level: 1, name: 'Registrar y anular pagos' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir en Quanela/ }).getAttribute('href')).toBe('https://quanela.com/login?next=%2Foperations')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://doc.quanela.com/orders/register-payment')
  })

  it('an old /help/… link goes to the same page without the prefix', async () => {
    const router = open('/help/faq/faq')
    expect(await screen.findByRole('heading', { level: 1, name: 'Preguntas frecuentes' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/faq/faq')
  })

  it('anything else goes to the start', async () => {
    const router = open('/a/b/c/d')
    expect(await screen.findByRole('heading', { level: 1, name: '¿En qué te ayudamos?' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
  })
})
