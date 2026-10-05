// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0025: the login keeps email + password for everyone and adds the owner methods below.
const state = vi.hoisted(() => ({ methods: [] as string[], session: null as null | object }))
const calls = vi.hoisted(() => ({ requestCode: vi.fn(async (_phone: string, _opts: { create: boolean }) => undefined), signIn: vi.fn(async () => ({ error: null })) }))

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ session: state.session, signIn: calls.signIn }) }))
vi.mock('@/shared/tenant/tenantContext', () => ({ useTenant: () => ({ mode: 'root', status: 'ready', organization: null, code: null }) }))
vi.mock('@/modules/signup/ownerAuth', async (original) => ({
  ...(await original<typeof import('@/modules/signup/ownerAuth')>()),
  enabledOwnerMethods: () => state.methods,
  requestPhoneCode: calls.requestCode,
}))

const { LoginPage } = await import('./LoginPage')

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

function renderLogin(entry: string | { pathname: string; state: unknown } = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.methods = []
  state.session = null
  sessionStorage.clear()
  calls.requestCode.mockClear()
})
afterEach(cleanup)

describe('login (ADR 0025)', () => {
  it('without owner methods configured it is the same email + password login', () => {
    renderLogin()
    expect(screen.getByLabelText(/Correo electrónico/)).toBeTruthy()
    expect(screen.getByLabelText(/^Contraseña/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: /Entrar con el método/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Continuar con/ })).toBeNull()
  })

  it('with methods: the email form stays and the owner section is below', () => {
    state.methods = ['google', 'phone']
    renderLogin()
    expect(screen.getByLabelText(/Correo electrónico/)).toBeTruthy()
    expect(screen.getByText(/¿Creaste tu negocio con Google o tu teléfono\?/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continuar con Instagram' })).toBeNull()
    // On the login there is no "Continuar con email": the form above is that.
    expect(screen.queryByRole('button', { name: 'Continuar con email' })).toBeNull()
  })

  it('the phone code on the login never creates users', async () => {
    state.methods = ['phone']
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole('button', { name: 'Continuar con teléfono' }))
    await user.type(screen.getByLabelText(/Número de celular/), '3001234567')
    await user.click(screen.getByRole('button', { name: /Enviarme el código/ }))
    expect(calls.requestCode).toHaveBeenCalledWith('+573001234567', expect.objectContaining({ create: false }))
  })

  it('shows the notice of the D3 guard', () => {
    renderLogin({ pathname: '/login', state: { notice: 'Entra con tu correo y tu contraseña.' } })
    expect(screen.getByRole('status').textContent).toContain('Entra con tu correo y tu contraseña.')
  })

  it('back from an owner method, the sign-up decides; otherwise home as before', () => {
    state.session = {}
    sessionStorage.setItem('dk-owner-sign-in', '1')
    renderLogin()
    expect(screen.getByTestId('where').textContent).toBe('/registro?continuar=1')
    cleanup()
    sessionStorage.clear()
    renderLogin()
    expect(screen.getByTestId('where').textContent).toBe('/')
  })
})
