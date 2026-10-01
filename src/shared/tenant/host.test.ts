import { describe, expect, it } from 'vitest'
import { parseHost, sharedCookieDomain } from './host'

describe('parseHost (ADR 0021/0022)', () => {
  it('a subdomain of the root domain is an organization code, in uppercase', () => {
    expect(parseHost('a7k92p.quanela.com', 'quanela.com')).toEqual({ kind: 'tenant', code: 'A7K92P' })
    expect(parseHost('A7K92P.Quanela.com.', 'quanela.com')).toEqual({ kind: 'tenant', code: 'A7K92P' })
  })

  it('a name-like subdomain is read as a label; the database says it does not exist', () => {
    expect(parseHost('dark-kitchen.quanela.com', 'quanela.com')).toEqual({ kind: 'tenant', code: 'DARK-KITCHEN' })
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
    expect(parseHost('a7k92p.quanela.com', '')).toEqual({ kind: 'path' })
  })

  it('works with *.localhost in development', () => {
    expect(parseHost('localhost', 'localhost')).toEqual({ kind: 'root' })
    expect(parseHost('x4m8q2.localhost', 'localhost')).toEqual({ kind: 'tenant', code: 'X4M8Q2' })
  })

  it('shares the session cookie only on a real domain', () => {
    expect(sharedCookieDomain('quanela.com')).toBe('.quanela.com')
    expect(sharedCookieDomain('localhost')).toBeNull()
    expect(sharedCookieDomain('')).toBeNull()
  })
})
