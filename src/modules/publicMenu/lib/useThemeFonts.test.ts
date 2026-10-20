// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TEMPLATES } from './themes'
import { FONT_LOADERS, loadThemeFont, useThemeFonts } from './useThemeFonts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ADR 0071: the theme fonts are self-hosted chunks, loaded on demand (no Google Fonts).
describe('useThemeFonts', () => {
  it('loads only the two fonts of the theme, once each', () => {
    const spies = Object.fromEntries(Object.keys(FONT_LOADERS).map((f) => [f, vi.spyOn(FONT_LOADERS, f as keyof typeof FONT_LOADERS).mockResolvedValue(undefined)]))
    const { rerender } = renderHook(({ theme }) => useThemeFonts(theme), { initialProps: { theme: TEMPLATES.classic.theme } })
    rerender({ theme: { ...TEMPLATES.classic.theme } })
    renderHook(() => useThemeFonts(TEMPLATES.classic.theme))
    const called = Object.entries(spies).filter(([, s]) => s.mock.calls.length > 0)
    expect(called.map(([f, s]) => [f, s.mock.calls.length])).toEqual([
      ['Lora', 1],
      ['Playfair Display', 1],
    ])
  })

  it('a font that failed to load is requested again later', async () => {
    const spy = vi.spyOn(FONT_LOADERS, 'Caveat').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    loadThemeFont('Caveat')
    await Promise.resolve()
    await Promise.resolve()
    loadThemeFont('Caveat')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('every font has a self-hosted stylesheet', async () => {
    await expect(Promise.all(Object.values(FONT_LOADERS).map((load) => load()))).resolves.toBeDefined()
  })
})
