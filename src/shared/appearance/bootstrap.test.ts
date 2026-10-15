// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import html from '../../../index.html?raw'

// ADR 0061: the script in index.html applies the saved theme before the first paint (no flash of the wrong one).
const script = html.match(/<script>\s*(try \{[\s\S]*?\} catch \(e\) \{\})\s*<\/script>/)![1]

function boot(saved: unknown, prefersLight = false, path = '/') {
  window.history.replaceState(null, '', path)
  if (saved === undefined) localStorage.removeItem('dk-appearance')
  else localStorage.setItem('dk-appearance', typeof saved === 'string' ? saved : JSON.stringify(saved))
  window.matchMedia = ((q: string) => ({ matches: q.includes('light') && prefersLight })) as unknown as typeof window.matchMedia
  new Function(script)()
  return document.documentElement.dataset.theme
}

afterEach(() => localStorage.clear())

describe('first paint (index.html)', () => {
  it('applies dark, light and neutral; system follows the OS; anything else is dark', () => {
    expect(boot({ theme: 'neutral' })).toBe('neutral')
    expect(boot({ theme: 'light' })).toBe('light')
    expect(boot({ theme: 'dark' })).toBe('dark')
    expect(boot({ theme: 'system' }, true)).toBe('light')
    expect(boot({ theme: 'system' }, false)).toBe('dark')
    expect(boot({ theme: 'sepia' })).toBe('dark')
    expect(boot('not json')).toBe('dark')
  })

  it('without a chosen theme: light on the login, sign-up and help center; dark elsewhere (ADR 0061)', () => {
    expect(boot(undefined, false, '/login')).toBe('light')
    expect(boot(undefined, false, '/registro')).toBe('light')
    expect(boot(undefined, false, '/activar/abc')).toBe('light')
    expect(boot(undefined, false, '/help/orders')).toBe('light')
    expect(boot(undefined, false, '/k/centro/operations')).toBe('dark')
    expect(boot({ theme: 'dark' }, false, '/login')).toBe('dark')
    expect(boot({ theme: 'neutral' }, false, '/registro')).toBe('neutral')
    window.history.replaceState(null, '', '/')
  })
})
