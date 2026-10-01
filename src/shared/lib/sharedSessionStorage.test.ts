import { describe, expect, it } from 'vitest'
import { createSharedSessionStorage } from './sharedSessionStorage'

/** A tiny cookie jar that honours Max-Age=0 (delete) and ignores attributes. */
function memoryJar() {
  const cookies = new Map<string, string>()
  const writes: string[] = []
  return {
    writes,
    read: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    write: (cookie: string) => {
      writes.push(cookie)
      const [pair, ...attrs] = cookie.split(';').map((s) => s.trim())
      const i = pair.indexOf('=')
      const name = pair.slice(0, i)
      if (attrs.some((a) => a === 'Max-Age=0')) cookies.delete(name)
      else cookies.set(name, pair.slice(i + 1))
    },
    size: () => cookies.size,
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => void data.delete(k), has: (k: string) => data.has(k) }
}

describe('shared session storage (ADR 0021)', () => {
  it('splits a large session in parts on the parent domain and joins it back', () => {
    const jar = memoryJar()
    const store = createSharedSessionStorage('.quanela.com', { jar, legacy: null, secure: true })
    const session = JSON.stringify({ access_token: 'x'.repeat(5000), user: { email: 'ana@quanela.com' } })
    store.setItem('sb-auth', session)
    expect(jar.size()).toBeGreaterThan(1)
    expect(jar.writes.every((w) => w.includes('Domain=.quanela.com') && w.includes('Secure') && w.includes('SameSite=Lax'))).toBe(true)
    expect(store.getItem('sb-auth')).toBe(session)
  })

  it('removes leftover parts when the value gets shorter, and everything on sign-out', () => {
    const jar = memoryJar()
    const store = createSharedSessionStorage('.quanela.com', { jar, legacy: null })
    store.setItem('sb-auth', 'y'.repeat(7000))
    store.setItem('sb-auth', 'short')
    expect(jar.size()).toBe(1)
    expect(store.getItem('sb-auth')).toBe('short')
    store.removeItem('sb-auth')
    expect(jar.size()).toBe(0)
    expect(store.getItem('sb-auth')).toBeNull()
  })

  it('moves an existing localStorage session to the cookie (nobody is signed out)', () => {
    const jar = memoryJar()
    const legacy = memoryStorage({ 'sb-auth': '{"access_token":"old"}' })
    const store = createSharedSessionStorage('.quanela.com', { jar, legacy })
    expect(store.getItem('sb-auth')).toBe('{"access_token":"old"}')
    expect(legacy.has('sb-auth')).toBe(false)
    expect(store.getItem('sb-auth')).toBe('{"access_token":"old"}')
  })

  it('does not mix keys that share a prefix', () => {
    const jar = memoryJar()
    const store = createSharedSessionStorage('.quanela.com', { jar, legacy: null })
    store.setItem('sb-auth', 'a')
    store.setItem('sb-auth-code-verifier', 'b')
    expect(store.getItem('sb-auth')).toBe('a')
    expect(store.getItem('sb-auth-code-verifier')).toBe('b')
  })
})
