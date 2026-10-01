import { describe, expect, it } from 'vitest'
import { parseHost, sharedCookieDomain } from './host'

describe('parseHost (ADR 0021)', () => {
  it('a subdomain of the root domain is an organization', () => {
    expect(parseHost('dark-kitchen.quanela.com', 'quanela.com')).toEqual({ kind: 'tenant', slug: 'dark-kitchen' })
    expect(parseHost('Dark-Kitchen.Quanela.com.', 'quanela.com')).toEqual({ kind: 'tenant', slug: 'dark-kitchen' })
  })

  it('the root and www are the platform', () => {
    expect(parseHost('quanela.com', 'quanela.com')).toEqual({ kind: 'root' })
    expect(parseHost('www.quanela.com', 'quanela.com')).toEqual({ kind: 'root' })
  })

  it('other hosts work by path (Vercel previews, IP, deeper levels, no root configured)', () => {
    expect(parseHost('quanela-git-main.vercel.app', 'quanela.com')).toEqual({ kind: 'path' })
    expect(parseHost('127.0.0.1', 'quanela.com')).toEqual({ kind: 'path' })
    expect(parseHost('a.b.quanela.com', 'quanela.com')).toEqual({ kind: 'path' })
    expect(parseHost('evilquanela.com', 'quanela.com')).toEqual({ kind: 'path' })
    expect(parseHost('dark-kitchen.quanela.com', '')).toEqual({ kind: 'path' })
  })

  it('works with *.localhost in development', () => {
    expect(parseHost('localhost', 'localhost')).toEqual({ kind: 'root' })
    expect(parseHost('org-a.localhost', 'localhost')).toEqual({ kind: 'tenant', slug: 'org-a' })
  })

  it('shares the session cookie only on a real domain', () => {
    expect(sharedCookieDomain('quanela.com')).toBe('.quanela.com')
    expect(sharedCookieDomain('localhost')).toBeNull()
    expect(sharedCookieDomain('')).toBeNull()
  })
})
