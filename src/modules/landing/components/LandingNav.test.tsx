// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import { LandingNav } from './LandingNav'

const auth = vi.hoisted(() => ({
  session: null as null | object,
  loading: false,
  signOut: vi.fn(async () => ({ error: null as string | null })),
}))
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/shared/tenant/host', async (original) => ({
  ...(await original<typeof import('@/shared/tenant/host')>()),
  currentHost: () => ({ kind: 'root' }),
  docsUrl: (path = '/') => `https://doc.quanela.com${path}`,
}))

function renderNav() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <LandingNav />
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  auth.session = null
  auth.loading = false
  auth.signOut.mockClear()
})
afterEach(cleanup)

describe('landing (ADR 0035)', () => {
  it('«Ayuda» opens the help center on doc.quanela.com, on the top bar and in the phone menu', () => {
    renderNav()
    const navs = screen.getAllByRole('navigation', { name: 'Secciones' })
    expect(navs).toHaveLength(2)
    for (const nav of navs) expect(within(nav).getByRole('link', { name: 'Ayuda' }).getAttribute('href')).toBe('https://doc.quanela.com/')
  })
})

describe('the landing and the session', () => {
  it('without a session: sign in and create an account', () => {
    renderNav()
    expect(screen.getAllByRole('link', { name: 'Iniciar sesión' })[0].getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: 'Crear cuenta' }).getAttribute('href')).toBe('/registro')
    expect(screen.queryByRole('link', { name: /Ir a mi cuenta/ })).toBeNull()
  })

  it('while the session is being confirmed nothing claims either state', () => {
    auth.loading = true
    renderNav()
    expect(screen.getByRole('status', { name: 'Comprobando tu sesión' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Crear cuenta' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Ir a mi cuenta/ })).toBeNull()
  })

  it('with a session: go to the account or sign out, with a confirmation', async () => {
    auth.session = { user: { email: 'laura@negocio.co' } }
    renderNav()
    expect(screen.getByRole('link', { name: /Ir a mi cuenta/ }).getAttribute('href')).toBe('/app')
    const [barButton] = screen.getAllByRole('button', { name: /Cerrar sesión/ })
    await userEvent.setup().click(barButton)
    expect(auth.signOut).toHaveBeenCalledOnce()
    expect(await screen.findByText(/Cerraste sesión/)).toBeTruthy()
  })

  it('a failed sign-out says why', async () => {
    auth.session = { user: { email: 'laura@negocio.co' } }
    auth.signOut.mockResolvedValueOnce({ error: 'No pudimos cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.' })
    renderNav()
    await userEvent.setup().click(screen.getAllByRole('button', { name: /Cerrar sesión/ })[0])
    expect(await screen.findByText(/No pudimos cerrar la sesión/)).toBeTruthy()
  })
})
