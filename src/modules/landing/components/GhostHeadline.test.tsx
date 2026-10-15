// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GhostHeadline } from './GhostHeadline'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce'), addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
}

/** Each frame schedules the next after rendering: advance in small steps. */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 10) act(() => vi.advanceTimersByTime(10))
}

const visible = (h1: HTMLElement) => h1.querySelector('[aria-hidden] > span:last-child')!.textContent

describe('GhostHeadline', () => {
  it('is one heading with the whole text for screen readers, from the start', () => {
    mockReducedMotion(false)
    render(<GhostHeadline />)
    expect(screen.getByRole('heading', { level: 1, name: 'Tu cocina, más inteligente' })).toBeTruthy()
  })

  it('types, suggests, discards, suggests again with Tab and accepts: ends on the real headline', () => {
    mockReducedMotion(false)
    vi.useFakeTimers()
    render(<GhostHeadline />)
    const h1 = screen.getByRole('heading')
    expect(visible(h1)).toBe('')
    advance(1250)
    expect(visible(h1)).toBe('Tu cocina,')
    advance(700)
    expect(visible(h1)).toContain('ordenada')
    advance(900)
    expect(visible(h1)).toContain('inteligente')
    expect(visible(h1)).toContain('Tab')
    advance(1500)
    expect(visible(h1)).toBe('Tu cocina,más inteligente')
  })

  it('with reduced motion the headline is simply there, without the caret blinking', () => {
    mockReducedMotion(true)
    render(<GhostHeadline />)
    const h1 = screen.getByRole('heading')
    expect(visible(h1)).toBe('Tu cocina,más inteligente')
    expect(h1.querySelector('.motion-safe\\:animate-caret')).toBeNull()
  })
})
