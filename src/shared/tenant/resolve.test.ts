import type { MyContext } from '@/shared/kitchen/kitchensApi'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
const { tenantAccess } = await import('./resolve')

const org = (over: Partial<MyContext['organizations'][number]> = {}) => ({
  id: 'org-a', slug: 'org-a', tenantCode: 'A7K92P', name: 'Org A', active: true, isOwner: false, isSuperAdmin: false, status: 'active' as const, permissions: [], ...over,
})
const account = (id: string, organizationId: string, active = true) => ({ id, slug: id, name: id, organizationId, iconKey: null, active, superAdmin: false, defaultRoleId: null, roles: [] })
const ctx = (over: Partial<MyContext> = {}): MyContext => ({
  profile: { id: 'u', fullName: 'Ana', avatarKey: null, active: true, isPlatformAdmin: false, lastAccountId: null },
  accountPermissions: [],
  organizations: [org(), org({ id: 'org-b', slug: 'org-b', tenantCode: 'X4M8Q2', name: 'Org B' })],
  accounts: [account('a1', 'org-a'), account('b1', 'org-b')],
  ...over,
})

describe('tenantAccess (ADR 0021/0022)', () => {
  const tenantA = { exists: true, code: 'A7K92P', name: 'Org A', active: true }

  it('unknown and deactivated subdomains', () => {
    expect(tenantAccess({ exists: false }, true, ctx()).status).toBe('not_found')
    expect(tenantAccess({ ...tenantA, active: false }, true, ctx()).status).toBe('inactive')
  })

  it('without a session: the login of the organization', () => {
    expect(tenantAccess(tenantA, false, undefined).status).toBe('signed_out')
  })

  it('knowing the code is not enough: the membership decides', () => {
    expect(tenantAccess({ ...tenantA, code: 'Q81MZ7' }, true, ctx()).status).toBe('no_access')
  })

  it('a member enters with ONLY the accounts of this organization', () => {
    const a = tenantAccess(tenantA, true, ctx())
    expect(a.status).toBe('ready')
    expect(a.accounts.map((x) => x.id)).toEqual(['a1'])
    expect(tenantAccess({ ...tenantA, code: 'X4M8Q2' }, true, ctx()).accounts.map((x) => x.id)).toEqual(['b1'])
  })

  it('an email that exists but is not a member of this organization does not enter', () => {
    const onlyB = ctx({ organizations: [org({ id: 'org-b', slug: 'org-b', tenantCode: 'X4M8Q2' })], accounts: [account('b1', 'org-b')] })
    expect(tenantAccess(tenantA, true, onlyB).status).toBe('no_access')
  })

  it('a pending or disabled membership does not enter', () => {
    expect(tenantAccess(tenantA, true, ctx({ organizations: [org({ status: 'pending' })] })).status).toBe('no_access')
    expect(tenantAccess(tenantA, true, ctx({ organizations: [org({ status: 'disabled' })] })).status).toBe('no_access')
  })

  it('a member without accounts enters only with organization permissions', () => {
    const noAccounts = ctx({ accounts: [] })
    expect(tenantAccess(tenantA, true, noAccounts).status).toBe('no_access')
    expect(tenantAccess(tenantA, true, ctx({ accounts: [], organizations: [org({ permissions: ['users.manage'] })] })).status).toBe('ready')
  })
})
