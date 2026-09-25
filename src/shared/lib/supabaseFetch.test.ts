import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActiveKitchenId, setActiveRoleId } from '@/shared/kitchen/activeKitchen'
import { kitchenAwareFetch } from './supabase'

afterEach(() => {
  vi.unstubAllGlobals()
  setActiveKitchenId(null)
  setActiveRoleId(null)
})

function captureFetch() {
  const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('[]'))
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('fetch hacia Supabase', () => {
  it('nunca usa la caché HTTP del navegador (datos frescos y sin CORS de otro puerto)', async () => {
    const spy = captureFetch()
    await kitchenAwareFetch('https://x.supabase.co/rest/v1/dk_products', { headers: { apikey: 'k' } })
    const init = spy.mock.calls[0][1]!
    expect(init.cache).toBe('no-store')
    expect(new Headers(init.headers).get('apikey')).toBe('k')
  })

  it('lleva la Cuenta y el rol activos', async () => {
    const spy = captureFetch()
    setActiveKitchenId('cuenta-1')
    setActiveRoleId('rol-1')
    await kitchenAwareFetch('https://x.supabase.co/rest/v1/dk_orders')
    const headers = new Headers((spy.mock.calls[0][1]!).headers)
    expect(headers.get('x-dk-kitchen-id')).toBe('cuenta-1')
    expect(headers.get('x-dk-role-id')).toBe('rol-1')
  })

  it('fuera de una Cuenta no envía encabezados de Cuenta ni de rol', async () => {
    const spy = captureFetch()
    await kitchenAwareFetch('https://x.supabase.co/auth/v1/token')
    const init = spy.mock.calls[0][1]!
    expect(new Headers(init.headers).has('x-dk-kitchen-id')).toBe(false)
    expect(init.cache).toBe('no-store')
  })
})
