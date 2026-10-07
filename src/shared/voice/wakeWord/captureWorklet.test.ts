import { afterEach, describe, expect, it } from 'vitest'

type Processor = { process: (inputs: Float32Array[][]) => boolean; port: { postMessage: (m: Int16Array) => void } }

const g = globalThis as Record<string, unknown>
let Registered: (new () => Processor) | undefined

/** Loads the worklet once in a fake AudioWorkletGlobalScope. */
async function worklet() {
  if (!Registered) {
    g.AudioWorkletProcessor = class {
      port = { postMessage: (_m: Int16Array) => {} }
    }
    g.registerProcessor = (_name: string, cls: new () => Processor) => {
      Registered = cls
    }
    await import('./captureWorklet.js')
  }
  return Registered!
}

/** A processor as if the device ran at `rate` (the scope's sampleRate is read on construction). */
async function loadWorklet(rate: number) {
  const Processor = await worklet()
  g.sampleRate = rate
  const processor = new Processor()
  const chunks: Int16Array[] = []
  processor.port.postMessage = (m) => chunks.push(m)
  return { processor, chunks }
}

function run(processor: Processor, signal: Float32Array) {
  for (let i = 0; i + 128 <= signal.length; i += 128) processor.process([[signal.subarray(i, i + 128)]])
}

const tone = (rate: number, freq: number, seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate))

function rms(chunks: Int16Array[]) {
  const all = chunks.slice(2).flatMap((c) => Array.from(c))
  return Math.sqrt(all.reduce((s, v) => s + v * v, 0) / all.length) / 32767
}

describe('capture worklet (ADR 0016)', () => {
  afterEach(() => {
    delete g.sampleRate
  })

  it.each([48000, 44100, 16000])('turns %i Hz audio into 80 ms chunks at 16 kHz', async (rate) => {
    const { processor, chunks } = await loadWorklet(rate)
    run(processor, tone(rate, 1000, 1))
    expect(chunks.length).toBeGreaterThanOrEqual(11)
    expect(chunks.length).toBeLessThanOrEqual(13)
    expect(chunks.every((c) => c.length === 1280)).toBe(true)
    // A 1 kHz tone keeps its level (0.5 peak → 0.354 RMS)…
    expect(rms(chunks)).toBeCloseTo(0.354, 1)
    // …and its pitch: 2000 zero crossings per second at 16 kHz → 160 per chunk.
    const c = chunks[5]
    let crossings = 0
    for (let i = 1; i < c.length; i++) if ((c[i - 1] < 0) !== (c[i] < 0)) crossings++
    expect(crossings).toBeGreaterThanOrEqual(158)
    expect(crossings).toBeLessThanOrEqual(162)
  })

  it('removes sound above 8 kHz instead of folding it into speech', async () => {
    const { processor, chunks } = await loadWorklet(48000)
    run(processor, tone(48000, 12000, 1))
    expect(rms(chunks)).toBeLessThan(0.01)
  })
})

// ADR 0041 (D6): where the detector may keep its microphone while the recognizer opens its own.
describe('sharing the microphone', async () => {
  const { canShareMicrophone, silentChunk } = await import('./capture')
  it('Chromium, Edge and Firefox share; Safari and every iOS browser do not', () => {
    expect(canShareMicrophone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 0)).toBe(true)
    expect(canShareMicrophone('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', 0)).toBe(true)
    expect(canShareMicrophone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0', 0)).toBe(true)
    expect(canShareMicrophone('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 5)).toBe(true)
    expect(canShareMicrophone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 0)).toBe(false)
    expect(canShareMicrophone('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1', 5)).toBe(false)
    expect(canShareMicrophone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 5)).toBe(false)
  })

  it('silence is a little noise, never louder than ±2', () => {
    const c = silentChunk(1280)
    expect(c).toHaveLength(1280)
    expect(Math.max(...Array.from(c, Math.abs))).toBeLessThanOrEqual(2)
  })
})
