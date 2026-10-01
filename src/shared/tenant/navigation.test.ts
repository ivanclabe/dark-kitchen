// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://a7k92p.quanela.com/k/cuenta-a/orders?x=1"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hostRedirectFor } from './navigation'
import { currentHost, rootUrl, tenantUrl } from './host'

describe('subdomain navigation (ADR 0021)', () => {
  beforeEach(() => vi.stubEnv('VITE_TENANT_ROOT_DOMAIN', 'quanela.com'))
  afterEach(() => vi.unstubAllEnvs())

  it('this page is organization A7K92P', () => {
    expect(currentHost()).toEqual({ kind: 'tenant', code: 'A7K92P' })
  })

  it('an account of A stays here; one of B goes to B with the same path', () => {
    expect(hostRedirectFor('A7K92P', '/k/cuenta-a/orders?x=1')).toBeNull()
    expect(hostRedirectFor('X4M8Q2', '/k/cuenta-b/orders?x=1')).toBe('https://x4m8q2.quanela.com/k/cuenta-b/orders?x=1')
  })

  it('builds the addresses of an organization (lowercase host) and of the root', () => {
    expect(tenantUrl('X4M8Q2', '/')).toBe('https://x4m8q2.quanela.com/')
    expect(rootUrl('/registro')).toBe('https://quanela.com/registro')
  })

  it('without a root domain (previews) nothing changes host', () => {
    vi.stubEnv('VITE_TENANT_ROOT_DOMAIN', '')
    expect(hostRedirectFor('X4M8Q2', '/k/cuenta-b/')).toBeNull()
    expect(tenantUrl('X4M8Q2')).toBeNull()
  })
})
