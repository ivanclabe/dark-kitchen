// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyAppearance, applyRouteDefault, APPEARANCE_KEY, defaultThemeFor, readAppearance, resolveTheme, saveAppearance, savedTheme } from './appearance'

afterEach(() => localStorage.clear())

describe('appearance (ADR 0023)', () => {
  it('defaults to dark and normal text; ignores garbage', () => {
    expect(readAppearance()).toEqual({ theme: 'dark', textSize: 'normal' })
    localStorage.setItem(APPEARANCE_KEY, '{"theme":"neon","textSize":5}')
    expect(readAppearance()).toEqual({ theme: 'dark', textSize: 'normal' })
    localStorage.setItem(APPEARANCE_KEY, 'not json')
    expect(readAppearance()).toEqual({ theme: 'dark', textSize: 'normal' })
  })

  it('neutral is a theme of its own (ADR 0061): saved, restored and applied as a light color scheme', () => {
    saveAppearance({ theme: 'neutral' })
    expect(readAppearance().theme).toBe('neutral')
    const root = document.documentElement
    expect(root.dataset.theme).toBe('neutral')
    expect(root.style.colorScheme).toBe('light')
    expect(resolveTheme('neutral', false)).toBe('neutral')
    expect(resolveTheme('neutral', true)).toBe('neutral')
    saveAppearance({ theme: 'dark' })
    expect(root.style.colorScheme).toBe('dark')
  })

  it('without a chosen theme: light on sign-in, account creation and help; dark in the app (ADR 0061)', () => {
    for (const path of ['/login', '/registro', '/registro/confirmado', '/activar/abc', '/set-password', '/help', '/help/orders/x'])
      expect(defaultThemeFor(path, false), path).toBe('light')
    for (const path of ['/', '/landing', '/k/centro/operations', '/cuentas', '/menu/brasa', '/loginx'])
      expect(defaultThemeFor(path, false), path).toBe('dark')
    expect(defaultThemeFor('/', true)).toBe('light') // doc.quanela.com
    const root = document.documentElement
    expect(savedTheme()).toBeNull()
    applyRouteDefault('/login')
    expect(root.dataset.theme).toBe('light')
    applyRouteDefault('/k/centro/operations')
    expect(root.dataset.theme).toBe('dark')
    // A chosen theme always wins.
    saveAppearance({ theme: 'neutral' })
    applyRouteDefault('/login')
    expect(root.dataset.theme).toBe('neutral')
  })

  it('"system" follows the operating system', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('saves per device and applies it to <html>', () => {
    saveAppearance({ theme: 'light' })
    saveAppearance({ textSize: 'large' })
    expect(readAppearance()).toEqual({ theme: 'light', textSize: 'large' })
    const root = document.documentElement
    expect(root.dataset.theme).toBe('light')
    expect(root.dataset.textSize).toBe('large')
    applyAppearance({ theme: 'dark', textSize: 'normal' })
    expect(root.dataset.theme).toBe('dark')
  })
})

describe('appearance shared by every subdomain (ADR 0021/0023)', () => {
  it('the cookie of the parent domain wins over this origin', () => {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme: 'dark', textSize: 'normal' }))
    document.cookie = `${APPEARANCE_KEY}=${encodeURIComponent(JSON.stringify({ theme: 'light', textSize: 'large' }))}; Path=/`
    expect(readAppearance()).toEqual({ theme: 'light', textSize: 'large' })
    document.cookie = `${APPEARANCE_KEY}=; Max-Age=0; Path=/`
  })
})
