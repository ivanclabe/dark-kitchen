// @vitest-environment jsdom
import { PRICING } from '@/test/pricingFixture'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Registro con plan (ADR 0010, 3.4): pantallas sin red ni Supabase.
const flags = vi.hoisted(() => ({ signup: true }))
const signUpBusiness = vi.hoisted(() => vi.fn(async (_input: unknown) => ({ hasSession: false })))

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ session: null }) }))
vi.mock('@/shared/plans/usePlans', async (original) => ({
  ...(await original<typeof import('@/shared/plans/usePlans')>()),
  usePublicPricing: () => ({ data: PRICING, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  get PUBLIC_SIGNUP_ENABLED() {
    return flags.signup
  },
  TURNSTILE_SITE_KEY: undefined,
  signUpBusiness,
}))

const { SignUpPage } = await import('./SignUpPage')

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SignUpPage />
    </MemoryRouter>,
  )
}

async function fillUser(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Tu nombre/), 'Ana Prueba')
  await user.type(screen.getByLabelText(/Correo/), 'ana@prueba.test')
  await user.type(screen.getByLabelText(/Contraseña/), 'solo-una-prueba')
  await user.click(screen.getByRole('button', { name: /Continuar/ }))
}

beforeEach(() => {
  flags.signup = true
  sessionStorage.clear()
  signUpBusiness.mockClear()
})
afterEach(cleanup)

describe('registro con plan', () => {
  it('desde Precios: conserva el plan, no repite el selector y deja cambiarlo', async () => {
    const user = userEvent.setup()
    renderAt('/registro?plan=business')
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy()
    expect(screen.getByText(/Business — \$99\.900 COP\/mes/)).toBeTruthy()

    await fillUser(user)
    expect(screen.getByText('Paso 3 de 3')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cambiar plan' }))
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Business seleccionado/ })).toBeTruthy()
    // Enterprise se compara, pero se contrata con ventas.
    expect(screen.queryByRole('button', { name: /Elegir Enterprise/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Hablar con ventas' }).getAttribute('href')).toBe('mailto:ventas@darkkitchen.co')

    await user.click(screen.getByRole('button', { name: 'Elegir Standard' }))
    expect(screen.getByText('Paso 3 de 3')).toBeTruthy()
    expect(screen.getByText(/Standard — \$49\.900 COP\/mes/)).toBeTruthy()
    expect(sessionStorage.getItem('dk-signup-plan')).toBe('standard')
  })

  it('sin plan: el selector es obligatorio antes de continuar', async () => {
    const user = userEvent.setup()
    renderAt('/registro')
    expect(screen.queryByText('Plan seleccionado')).toBeNull()
    await fillUser(user)
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy()
    expect(screen.getByText('Elige el plan para tu negocio')).toBeTruthy()
  })

  it('un plan que no se elige en el registro (Enterprise) no queda preseleccionado', async () => {
    const user = userEvent.setup()
    renderAt('/registro?plan=enterprise')
    expect(screen.queryByText('Plan seleccionado')).toBeNull()
    await fillUser(user)
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy()
  })

  it('envía el plan y la primera Cuenta con el registro', async () => {
    const user = userEvent.setup()
    renderAt('/registro?plan=business')
    await fillUser(user)
    await user.type(screen.getByLabelText(/Nombre del negocio/), 'Pizzería Norte')
    await user.selectOptions(screen.getByLabelText(/Sector/), 'fast_food')
    await user.selectOptions(screen.getByLabelText(/Categoría/), 'pizza')
    await user.click(screen.getByRole('button', { name: 'Crear mi negocio' }))
    expect(signUpBusiness).toHaveBeenCalledTimes(1)
    const input = signUpBusiness.mock.calls[0][0] as unknown as { plan: string; organization: { accountName: string; accountIcon: string } }
    expect(input.plan).toBe('business')
    expect(input.organization.accountName).toBe('Pizzería Norte')
    expect(input.organization.accountIcon).toBe('pizza')
    expect(await screen.findByText('Revisa tu correo')).toBeTruthy()
  })

  it('con el registro cerrado muestra el plan elegido y el contacto de ventas', () => {
    flags.signup = false
    renderAt('/registro?plan=business')
    expect(screen.getByText('El registro abre pronto')).toBeTruthy()
    expect(screen.getByText(/Business — \$99\.900 COP\/mes/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hablar con ventas' })).toBeTruthy()
  })
})
