// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'

// ADR 0043: «Tus cuentas» puts the account used last first, and says so.
const kitchen = (id: string, name: string) => ({
  id,
  slug: id,
  name,
  organizationId: 'org1',
  active: true,
  iconKey: null,
  roleName: 'SUPER_ADMIN',
  roleOptions: [{ id: 'r1' }],
  superAdmin: true,
})
const state = vi.hoisted(() => ({ lastAccountId: 'b' as string | null }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ profile: { fullName: 'Laura Gómez' }, signOut: vi.fn() }) }))
vi.mock('@/shared/tenant/tenantContext', () => ({ useTenant: () => ({ mode: 'path' }) }))
vi.mock('@/modules/organization/api/organization', () => ({ setAccountsActive: vi.fn() }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => {
  const accounts = [kitchen('a', 'Centro'), kitchen('b', 'Norte'), kitchen('c', 'Sur')]
  const ctx = () => ({ accounts, organizations: [], profile: { lastAccountId: state.lastAccountId } })
  return {
    MY_KITCHENS_KEY: ['my-kitchens'],
    useMyContext: () => ({ data: ctx() }),
    useMyKitchens: () => ({ data: accounts, isLoading: false, isError: false }),
    kitchensOf: () => accounts,
    kitchenPath: (slug: string) => `/k/${slug}`,
  }
})

const { KitchenSelectorPage } = await import('./KitchenSelectorPage')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <KitchenSelectorPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
afterEach(cleanup)

describe('Tus cuentas (ADR 0043)', () => {
  it('the account used last goes first and is marked', () => {
    renderPage()
    const cards = screen.getAllByRole('listitem')
    expect(within(cards[0]).getByText('Norte')).toBeTruthy()
    expect(within(cards[0]).getByText('Última que usaste')).toBeTruthy()
    expect(screen.getAllByText('Última que usaste')).toHaveLength(1)
  })

  it('without a remembered account, nothing is marked', () => {
    state.lastAccountId = null
    renderPage()
    expect(screen.queryByText('Última que usaste')).toBeNull()
    expect(within(screen.getAllByRole('listitem')[0]).getByText('Centro')).toBeTruthy()
  })
})
