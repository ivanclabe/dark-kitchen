// @vitest-environment jsdom
import { PRICING } from '@/test/pricingFixture'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0025: the owner signs up with Google, Instagram, phone or email. No network, no Supabase.
const auth = vi.hoisted(() => ({
  session: null as null | { user: { email?: string; phone?: string; user_metadata: Record<string, unknown> } },
  profile: null as null | { id: string },
  signOut: vi.fn(async () => undefined),
}))
const calls = vi.hoisted(() => ({
  oauth: vi.fn(async (_method: string, _path?: string) => undefined),
  requestCode: vi.fn(async (_phone: string, _opts: { create: boolean }) => undefined),
  verifyCode: vi.fn(async (_phone: string, _code: string) => undefined),
  savePending: vi.fn(async (_input: unknown) => undefined),
  owns: vi.fn(async () => false),
}))

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ session: auth.session, profile: auth.profile, loading: false, profileLoading: false, signOut: auth.signOut }),
}))
vi.mock('@/shared/plans/usePlans', async (original) => ({
  ...(await original<typeof import('@/shared/plans/usePlans')>()),
  usePublicPricing: () => ({ data: PRICING, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  PUBLIC_SIGNUP_ENABLED: true,
  TURNSTILE_SITE_KEY: undefined,
  savePendingBusiness: calls.savePending,
}))
vi.mock('../ownerAuth', async (original) => ({
  ...(await original<typeof import('../ownerAuth')>()),
  enabledOwnerMethods: () => ['google', 'instagram', 'phone'],
  continueWithProvider: calls.oauth,
  requestPhoneCode: calls.requestCode,
  verifyPhoneCode: calls.verifyCode,
}))
vi.mock('../ownerSession', async (original) => ({ ...(await original<typeof import('../ownerSession')>()), ownsABusiness: calls.owns }))

const { SignUpPage } = await import('./SignUpPage')

function Where() {
  const location = useLocation()
  return <p data-testid="where">{`${location.pathname}|${(location.state as { notice?: string } | null)?.notice ?? ''}`}</p>
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/registro" element={<SignUpPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  auth.session = null
  auth.profile = null
  sessionStorage.clear()
  for (const fn of Object.values(calls)) fn.mockClear()
  auth.signOut.mockClear()
})
afterEach(cleanup)

describe('owner sign-up methods (ADR 0025)', () => {
  it('offers Google, Instagram, phone and email; email is the same form as before', async () => {
    const user = userEvent.setup()
    renderAt('/registro')
    for (const name of ['Continuar con Google', 'Continuar con Instagram', 'Continuar con teléfono', 'Continuar con email']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    await user.click(screen.getByRole('button', { name: 'Continuar con email' }))
    expect(screen.getByLabelText(/Tu nombre/)).toBeTruthy()
    expect(screen.getByLabelText(/Contraseña/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Otros métodos/ }))
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeTruthy()
  })

  it('Google leaves for the provider and marks the sign-in as an owner one', async () => {
    const user = userEvent.setup()
    renderAt('/registro')
    await user.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(calls.oauth).toHaveBeenCalledWith('google', undefined)
    expect(sessionStorage.getItem('dk-owner-sign-in')).not.toBeNull()
  })

  it('phone: validates the number, sends the code in E.164 (creating the user) and verifies it', async () => {
    const user = userEvent.setup()
    renderAt('/registro')
    await user.click(screen.getByRole('button', { name: 'Continuar con teléfono' }))
    const send = screen.getByRole('button', { name: /Enviarme el código/ }) as HTMLButtonElement
    await user.type(screen.getByLabelText(/Número de celular/), '123')
    expect(screen.getByText('Número no válido')).toBeTruthy()
    expect(send.disabled).toBe(true)
    await user.clear(screen.getByLabelText(/Número de celular/))
    await user.type(screen.getByLabelText(/Número de celular/), '300 123 4567')
    await user.click(send)
    expect(calls.requestCode).toHaveBeenCalledWith('+573001234567', expect.objectContaining({ create: true }))
    await user.type(await screen.findByLabelText(/Código/), '123456')
    await user.click(screen.getByRole('button', { name: 'Verificar' }))
    expect(calls.verifyCode).toHaveBeenCalledWith('+573001234567', '123456')
    expect(screen.getByRole('button', { name: /Reenviar en/ })).toBeTruthy()
  })

  it('back from the provider without a profile: plan and business, with the provider name, then everything is created', async () => {
    auth.session = { user: { email: 'gabi@gmail.test', user_metadata: { full_name: 'Gabriela Gómez' } } }
    const user = userEvent.setup()
    renderAt('/registro?plan=business')
    expect(screen.getByText('Paso 3 de 3')).toBeTruthy()
    expect(screen.getByText(/Entraste como/).textContent).toContain('gabi@gmail.test')
    expect((screen.getByLabelText(/Tu nombre/) as HTMLInputElement).value).toBe('Gabriela Gómez')
    expect(screen.queryByLabelText(/Contraseña/)).toBeNull()
    await user.type(screen.getByLabelText(/Nombre del negocio/), 'Pizzas Gabi')
    await user.selectOptions(screen.getByLabelText(/Sector/), screen.getAllByRole('option')[1])
    await user.selectOptions(screen.getByLabelText(/Categoría/), screen.getAllByRole('option', { hidden: true }).find((o) => o.closest('select')?.id === screen.getByLabelText(/Categoría/).id && (o as HTMLOptionElement).value)!)
    await user.click(screen.getByRole('button', { name: 'Crear mi negocio' }))
    expect(calls.savePending).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Gabriela Gómez', plan: 'business', organization: expect.objectContaining({ name: 'Pizzas Gabi' }) }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/registro/confirmado|'))
  })

  it('D3: an invited user who came with Google (owns no business) is sent to sign in with email', async () => {
    auth.session = { user: { email: 'invitado@prueba.test', user_metadata: {} } }
    auth.profile = { id: 'u1' }
    sessionStorage.setItem('dk-owner-sign-in', '1')
    renderAt('/registro?continuar=1')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/login\|.*correo y tu contraseña/))
    expect(auth.signOut).toHaveBeenCalled()
  })

  it('an owner who came back with Google goes to their account', async () => {
    auth.session = { user: { email: 'duena@prueba.test', user_metadata: {} } }
    auth.profile = { id: 'u2' }
    calls.owns.mockResolvedValueOnce(true)
    sessionStorage.setItem('dk-owner-sign-in', '1')
    renderAt('/registro?continuar=1')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/|'))
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('a signed-in user who used email (no mark) just goes home, as before', async () => {
    auth.session = { user: { email: 'cajero@prueba.test', user_metadata: {} } }
    auth.profile = { id: 'u3' }
    renderAt('/registro')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/|'))
    expect(calls.owns).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('shows the error a provider sends back (it arrives in the real address)', () => {
    window.history.pushState({}, '', '/registro?error=access_denied&error_description=cancelled')
    renderAt('/registro')
    expect(screen.getByRole('alert').textContent).toBe('Cancelaste el inicio de sesión.')
    window.history.pushState({}, '', '/')
  })
})
