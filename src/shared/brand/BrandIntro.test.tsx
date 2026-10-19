// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrandIntro } from './BrandIntro'
import { finishBrandIntro, requestBrandIntro } from './brandIntroState'

// The welcome after signing in (ADR 0070): shown once on request, never blocks the app for long,
// and anyone can skip it.
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  finishBrandIntro()
  vi.useRealTimers()
})

const intro = () => screen.queryByTestId('brand-intro')

describe('BrandIntro', () => {
  it('shows nothing until a sign-in requests it', () => {
    render(<BrandIntro />)
    expect(intro()).toBeNull()
    act(() => requestBrandIntro())
    expect(intro()).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Entrando a Quanela')
  })

  it('leaves on its own after a few seconds', () => {
    render(<BrandIntro />)
    act(() => requestBrandIntro())
    act(() => vi.advanceTimersByTime(2800))
    expect(intro()?.className).toContain('brand-intro-leaving')
    act(() => vi.advanceTimersByTime(450))
    expect(intro()).toBeNull()
  })

  it('a click, a tap or Escape skips it', () => {
    render(<BrandIntro />)
    act(() => requestBrandIntro())
    fireEvent.pointerDown(intro()!)
    act(() => vi.advanceTimersByTime(450))
    expect(intro()).toBeNull()

    act(() => requestBrandIntro())
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => vi.advanceTimersByTime(450))
    expect(intro()).toBeNull()
  })
})
