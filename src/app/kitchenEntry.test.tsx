// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0043: right after signing in, someone with several accounts chooses one.
type Account = { id: string; slug: string; organizationId: string; active: boolean; isPlatformAdmin?: boolean }
const state = vi.hoisted(() => ({
  accounts: [] as Account[],
  lastAccountId: null as string | null,
  tenant: { mode: 'path' } as { mode: string; organization?: { id: string } },
}))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useMyContext: () => ({ isLoading: false, data: { accounts: state.accounts, organizations: [], profile: { lastAccountId: state.lastAccountId } } }),
  kitchensOf: (ctx: { accounts: Account[] }) => ctx.accounts,
  kitchenPath: (slug: string, to: string) => (to === '/' ? `/k/${slug}` : `/k/${slug}${to}`),
}))
vi.mock('@/shared/tenant/tenantContext', () => ({ useTenant: () => state.tenant }))

const { KitchenEntryRedirect } = await import('./kitchenEntry')
const { markAccountChoice, pendingAccountChoice } = await import('@/shared/kitchen/accountChoice')

function enter() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<KitchenEntryRedirect />} />
        <Route path="/cuentas" element={<p>Tus cuentas</p>} />
        <Route path="/k/:slug" element={<p>cuenta</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
const where = () => screen.getByText(/Tus cuentas|cuenta/).textContent

const A = { id: 'a', slug: 'centro', organizationId: 'org1', active: true }
const B = { id: 'b', slug: 'norte', organizationId: 'org1', active: true }
const C = { id: 'c', slug: 'otra', organizationId: 'org2', active: true }

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  state.accounts = [A, B]
  state.lastAccountId = 'a'
  state.tenant = { mode: 'path' }
})
afterEach(cleanup)

describe('entering after signing in (ADR 0043)', () => {
  it('just signed in with several accounts: «Tus cuentas», and the mark is used once', () => {
    markAccountChoice()
    enter()
    expect(where()).toBe('Tus cuentas')
    expect(pendingAccountChoice()).toBe(false)
    cleanup()
    enter()
    expect(where()).toBe('cuenta')
  })

  it('with the session already open (no mark): straight to the last account, as before', () => {
    enter()
    expect(where()).toBe('cuenta')
  })

  it('a single account: straight in, even right after signing in', () => {
    state.accounts = [A]
    markAccountChoice()
    enter()
    expect(where()).toBe('cuenta')
    expect(pendingAccountChoice()).toBe(false)
  })

  it("on a business's subdomain only its accounts count", () => {
    state.accounts = [A, C]
    state.tenant = { mode: 'tenant', organization: { id: 'org1' } }
    markAccountChoice()
    enter()
    expect(where()).toBe('cuenta')
  })

  it('a deactivated account does not count', () => {
    state.accounts = [A, { ...B, active: false }]
    markAccountChoice()
    enter()
    expect(where()).toBe('cuenta')
  })
})
