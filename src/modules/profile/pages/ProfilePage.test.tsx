// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'

// Mi perfil: the password folded until wanted, one field under the other.
const state = vi.hoisted(() => ({
  user: { email: 'laura@negocio.co', app_metadata: { providers: ['email'] } } as { email?: string; app_metadata: Record<string, unknown> },
  changed: [] as [string, string, string][],
}))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'p1', fullName: 'Laura Gómez', avatarKey: null }, user: state.user, refreshProfile: vi.fn() }),
}))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ kitchen: { id: 'k1' } }),
  useMyKitchens: () => ({ data: [{ id: 'k1', slug: 'centro', name: 'Centro', active: true, roleName: 'CAJA' }] }),
  kitchenPath: (slug: string, to: string) => `/k/${slug}${to}`,
}))
vi.mock('../api/profile', () => ({
  updateMyProfile: vi.fn(),
  changeMyPassword: async (email: string, current: string, next: string) => void state.changed.push([email, current, next]),
}))

const { ProfilePage } = await import('./ProfilePage')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.user = { email: 'laura@negocio.co', app_metadata: { providers: ['email'] } }
  state.changed = []
})
afterEach(cleanup)

describe('Mi perfil', () => {
  it('shows the email once (as the sign-in user), not as a disabled field', () => {
    renderPage()
    expect(screen.getByText('laura@negocio.co')).toBeTruthy()
    expect(screen.queryByLabelText('Correo')).toBeNull()
  })

  it('the password stays folded until «Cambiar contraseña»; then current, new and repeat, in that order', () => {
    renderPage()
    expect(screen.queryByLabelText(/Contraseña actual/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    const fields = [/Contraseña actual/, /Nueva contraseña/, /Repite la nueva/].map((l) => screen.getByLabelText(l))
    expect(fields[0].compareDocumentPosition(fields[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fields[1].compareDocumentPosition(fields[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.activeElement).toBe(fields[0])
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText(/Contraseña actual/)).toBeNull()
  })

  it('checks the new one, lets you see it, saves and folds again', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    fireEvent.change(screen.getByLabelText(/Contraseña actual/), { target: { value: 'vieja-1234' } })
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'corta' } })
    expect(screen.getByText('Mínimo 8 caracteres')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'nueva-5678' } })
    fireEvent.change(screen.getByLabelText(/Repite la nueva/), { target: { value: 'nueva-567' } })
    expect(screen.getByText('No coincide')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Guardar contraseña' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Repite la nueva/), { target: { value: 'nueva-5678' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Mostrar contraseña' })[1])
    expect((screen.getByLabelText(/Nueva contraseña/) as HTMLInputElement).type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    await waitFor(() => expect(state.changed).toEqual([['laura@negocio.co', 'vieja-1234', 'nueva-5678']]))
    await waitFor(() => expect(screen.queryByLabelText(/Contraseña actual/)).toBeNull())
  })

  it('who signs in with Google is told so, without a password form', () => {
    state.user = { email: 'laura@negocio.co', app_metadata: { providers: ['google'] } }
    renderPage()
    expect(screen.getByText(/Entras con Google: no usas una contraseña de Quanela/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cambiar contraseña' })).toBeNull()
  })
})
