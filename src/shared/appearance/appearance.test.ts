// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyAppearance, APPEARANCE_KEY, readAppearance, resolveTheme, saveAppearance } from './appearance'

afterEach(() => localStorage.clear())

describe('appearance (ADR 0023)', () => {
  it('defaults to dark and normal text; ignores garbage', () => {
    expect(readAppearance()).toEqual({ theme: 'dark', textSize: 'normal' })
    localStorage.setItem(APPEARANCE_KEY, '{"theme":"neon","textSize":5}')
    expect(readAppearance()).toEqual({ theme: 'dark', textSize: 'normal' })
    localStorage.setItem(APPEARANCE_KEY, 'not json')
    expect(readAppearance()).toEqual({ theme: 'dark', textSize: 'normal' })
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
