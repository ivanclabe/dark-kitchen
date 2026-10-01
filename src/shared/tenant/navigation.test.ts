// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://org-a.quanela.com/k/cuenta-a/orders?x=1"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hostRedirectFor } from './navigation'
import { currentHost, rootUrl, tenantUrl } from './host'

describe('subdomain navigation (ADR 0021)', () => {
  beforeEach(() => vi.stubEnv('VITE_TENANT_ROOT_DOMAIN', 'quanela.com'))
  afterEach(() => vi.unstubAllEnvs())

  it('this page is organization A', () => {
    expect(currentHost()).toEqual({ kind: 'tenant', slug: 'org-a' })
  })

  it('an account of A stays here; one of B goes to B with the same path', () => {
    expect(hostRedirectFor('org-a', '/k/cuenta-a/orders?x=1')).toBeNull()
    expect(hostRedirectFor('org-b', '/k/cuenta-b/orders?x=1')).toBe('https://org-b.quanela.com/k/cuenta-b/orders?x=1')
  })

  it('builds the addresses of an organization and of the root', () => {
    expect(tenantUrl('org-b', '/')).toBe('https://org-b.quanela.com/')
    expect(rootUrl('/registro')).toBe('https://quanela.com/registro')
  })

  it('without a root domain (previews) nothing changes host', () => {
    vi.stubEnv('VITE_TENANT_ROOT_DOMAIN', '')
    expect(hostRedirectFor('org-b', '/k/cuenta-b/')).toBeNull()
    expect(tenantUrl('org-b')).toBeNull()
  })
})
