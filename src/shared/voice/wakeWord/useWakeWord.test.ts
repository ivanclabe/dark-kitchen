// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0041 (D6): the detector stays ready between uses — fed silence while it
// is not listening for the phrase — except where the microphone cannot be shared.
const state = vi.hoisted(() => ({
  shares: true,
  speaking: false,
  captures: 0,
  stops: 0,
  onChunk: null as ((chunk: Int16Array) => void) | null,
  pushed: [] as number[],
  resets: 0,
}))
vi.mock('./capture', async (original) => ({
  ...(await original<typeof import('./capture')>()),
  canShareMicrophone: () => state.shares,
  startCapture: async (onChunk: (chunk: Int16Array) => void) => {
    state.captures++
    state.onChunk = onChunk
    return { stop: () => void state.stops++ }
  },
}))
vi.mock('./wakeWordModel', () => ({ loadWakeWordModels: async () => ({}) }))
vi.mock('../speechQueue', () => ({ deviceSpeech: { isSpeaking: () => state.speaking } }))
vi.mock('./wakeWordStream', () => ({
  CHUNK_SAMPLES: 1280,
  // A chunk that starts with 999 is «Oye Quanela»; the detector remembers the loudest sample it got.
  WakeWordStream: class {
    setTuning() {}
    reset() {
      state.resets++
    }
    async push(chunk: Int16Array) {
      state.pushed.push(Math.max(...Array.from(chunk, Math.abs)))
      return { score: chunk[0] === 999 ? 1 : 0, detected: chunk[0] === 999 }
    }
  },
}))

const { useWakeWord } = await import('./useWakeWord')

const PHRASE = (() => {
  const c = new Int16Array(1280).fill(500)
  c[0] = 999
  return c
})()
const NOISE = new Int16Array(1280).fill(800)

async function chunk(c: Int16Array) {
  await act(async () => {
    state.onChunk!(c)
    await Promise.resolve()
  })
}

function mount() {
  const onDetect = vi.fn()
  const view = renderHook((props: { suspended: boolean }) => useWakeWord({ active: true, suspended: props.suspended, tuning: { threshold: 0.9, confirmFrames: 2 }, onDetect }), {
    initialProps: { suspended: false },
  })
  return { ...view, onDetect }
}

beforeEach(() => {
  state.shares = true
  state.speaking = false
  state.captures = 0
  state.stops = 0
  state.onChunk = null
  state.pushed = []
  state.resets = 0
})
afterEach(() => vi.clearAllMocks())

describe('«Oye Quanela» detector between uses (ADR 0041, D6)', () => {
  it('keeps the microphone after detecting and while suspended, fed silence; hears the phrase again at once', async () => {
    const { rerender, onDetect, result } = mount()
    await act(async () => undefined)
    expect(result.current.state).toBe('listening')
    await chunk(PHRASE)
    expect(onDetect).toHaveBeenCalledTimes(1)
    expect(state.stops).toBe(0)

    rerender({ suspended: true })
    expect(result.current.state).toBe('standby')
    await chunk(NOISE)
    await chunk(PHRASE)
    expect(onDetect).toHaveBeenCalledTimes(1)
    expect(state.pushed.slice(-2).every((loudest) => loudest <= 2)).toBe(true)

    rerender({ suspended: false })
    await chunk(PHRASE)
    expect(onDetect).toHaveBeenCalledTimes(2)
    expect(state.captures).toBe(1)
    expect(state.stops).toBe(0)
  })

  it('while Quanela speaks it gets silence, not her voice, and needs no reset after', async () => {
    mount()
    await act(async () => undefined)
    state.speaking = true
    await chunk(PHRASE)
    expect(state.pushed.at(-1)).toBeLessThanOrEqual(2)
    state.speaking = false
    await chunk(NOISE)
    expect(state.pushed.at(-1)).toBe(800)
    expect(state.resets).toBe(0)
  })

  it('Safari: releases the microphone on detection and while suspended, as before', async () => {
    state.shares = false
    const { rerender, onDetect } = mount()
    await act(async () => undefined)
    await chunk(PHRASE)
    expect(onDetect).toHaveBeenCalledTimes(1)
    expect(state.stops).toBeGreaterThanOrEqual(1)
    rerender({ suspended: true })
    await act(async () => undefined)
    const captures = state.captures
    rerender({ suspended: false })
    await act(async () => undefined)
    expect(state.captures).toBe(captures + 1)
  })
})
