// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TIPS } from '@/shared/tips/tips'
import { FullScreenLoading } from './FullScreenLoading'

// The waits share state across screens by time: each test gets a clock a minute after the previous one.
let clock = Date.UTC(2026, 9, 15, 12)
beforeEach(() => {
  vi.useFakeTimers()
  clock += 60_000
  vi.setSystemTime(clock)
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.advanceTimersByTime(5000) // the next test is a new wait (and any fading copy is gone)
  vi.useRealTimers()
})

const progress = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))
const leavingCopies = () => document.body.querySelectorAll('[data-loading-leaving]').length

describe('the wait after signing in', () => {
  it('a quick wait shows nothing: no flash', () => {
    const view = render(<FullScreenLoading />)
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('status')).toBeNull()
    view.unmount()
    expect(leavingCopies()).toBe(0)
  })

  it('then says what is loading, and the bar only moves forward from one screen to the next', () => {
    const view = render(<FullScreenLoading stage="session" />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('status').textContent).toBe('Verificando tu sesión…')
    const afterSession = progress()
    expect(afterSession).toBeGreaterThan(8)
    view.unmount()
    render(<FullScreenLoading stage="kitchen" />)
    // The next screen of the same wait takes over at once (the fading copy goes away).
    expect(leavingCopies()).toBe(0)
    act(() => vi.advanceTimersByTime(300))
    expect(screen.getByRole('status').textContent).toBe('Abriendo tu cocina…')
    expect(progress()).toBeGreaterThanOrEqual(Math.max(afterSession, 60))
  })

  it('once shown it stays at least half a second, then fades out over the app', () => {
    const view = render(<FullScreenLoading />)
    act(() => vi.advanceTimersByTime(420)) // visible since ~300 ms
    view.unmount()
    expect(leavingCopies()).toBe(1)
    act(() => vi.advanceTimersByTime(300))
    expect(leavingCopies()).toBe(1)
    act(() => vi.advanceTimersByTime(600)) // the rest of the half second, then the fade
    expect(leavingCopies()).toBe(0)
  })

  it('a one-line tip only when there is time to read it', () => {
    render(<FullScreenLoading />)
    act(() => vi.advanceTimersByTime(1500))
    expect(TIPS.some((t) => document.body.textContent?.includes(t.short))).toBe(false)
    act(() => vi.advanceTimersByTime(1200))
    expect(TIPS.some((t) => document.body.textContent?.includes(t.short))).toBe(true)
  })

  it('the robot changes its face when tapped; after 10 seconds it offers to reload', () => {
    render(<FullScreenLoading stage="account" />)
    act(() => vi.advanceTimersByTime(400))
    const face = () => document.querySelector('[data-loading-screen] img[data-robot]')!.getAttribute('data-robot')
    expect(face()).toBe('idea')
    fireEvent.click(screen.getByRole('button', { name: 'Saludar a Quanela' }))
    expect(face()).toBe('wink')
    expect(screen.queryByRole('button', { name: /Recargar/ })).toBeNull()
    act(() => vi.advanceTimersByTime(10_500))
    expect(screen.getByRole('button', { name: /Recargar/ })).toBeTruthy()
  })

  it('continues on another subdomain from the shared cookie (sign-in on quanela.com → the organization)', () => {
    const now = Date.now()
    document.cookie = `dk-wait=${now - 3000}.${now - 500}.52.2; Path=/`
    render(<FullScreenLoading stage="session" />)
    expect(progress()).toBeGreaterThanOrEqual(52)
    document.cookie = 'dk-wait=; Max-Age=0; Path=/'
  })
})
