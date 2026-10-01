import { describe, expect, it } from 'vitest'
import { CHUNK_SAMPLES, CONTEXT_SAMPLES, WakeWordStream, type WakeWordModels } from './wakeWordStream'

/** Fake models that record what they receive; the classifier plays a script. */
function fakeModels(scores: number[] = []) {
  const melInputs: Float32Array[] = []
  const embeddingInputs: Float32Array[] = []
  let s = 0
  const models: WakeWordModels = {
    melspectrogram: async (samples) => {
      melInputs.push(samples)
      return new Float32Array(8 * 32).fill(samples[samples.length - 1])
    },
    embedding: async (mel) => {
      embeddingInputs.push(mel)
      return new Float32Array(96).fill(mel[mel.length - 1])
    },
    classifier: async () => scores[s++] ?? 0,
  }
  return { models, melInputs, embeddingInputs }
}

const chunk = (value: number) => new Int16Array(CHUNK_SAMPLES).fill(value)

async function feed(stream: WakeWordStream, n: number, value = 1) {
  const out = []
  for (let i = 0; i < n; i++) out.push(await stream.push(chunk(value)))
  return out
}

describe('WakeWordStream (ADR 0016)', () => {
  it('warms up for 24 chunks (~1.9 s) and scores from the 25th', async () => {
    const { models } = fakeModels([0.1])
    const results = await feed(new WakeWordStream(models, { threshold: 0.5, confirmFrames: 1 }), 25)
    expect(results.slice(0, 24).every((r) => r.score === null)).toBe(true)
    expect(results[24]).toEqual({ score: 0.1, detected: false })
  })

  it('prepends the last 480 samples of the previous chunk (zeros at start)', async () => {
    const { models, melInputs } = fakeModels()
    const stream = new WakeWordStream(models, { threshold: 0.5, confirmFrames: 1 })
    await stream.push(chunk(7))
    await stream.push(chunk(9))
    expect(melInputs[0].length).toBe(CONTEXT_SAMPLES + CHUNK_SAMPLES)
    expect(melInputs[0][0]).toBe(0)
    expect(melInputs[1][0]).toBe(7)
    expect(melInputs[1][CONTEXT_SAMPLES]).toBe(9)
  })

  it('applies x/10 + 2 to the mel frames and embeds the last 76', async () => {
    const { models, embeddingInputs } = fakeModels()
    await feed(new WakeWordStream(models, { threshold: 0.5, confirmFrames: 1 }), 10, 30)
    expect(embeddingInputs).toHaveLength(1)
    expect(embeddingInputs[0].length).toBe(76 * 32)
    expect(embeddingInputs[0][0]).toBeCloseTo(30 / 10 + 2)
  })

  it('needs confirmFrames consecutive chunks and then stays quiet', async () => {
    const warm = new Array(0).fill(0)
    const { models } = fakeModels([...warm, 0.9, 0.2, 0.9, 0.9, 0.9, 0.9])
    const stream = new WakeWordStream(models, { threshold: 0.5, confirmFrames: 2, refractoryChunks: 2 })
    await feed(stream, 24)
    const r = await feed(stream, 6)
    expect(r.map((x) => x.detected)).toEqual([false, false, false, true, false, false])
  })

  it('reset() forgets the audio and warms up again', async () => {
    const { models } = fakeModels([0.9, 0.9])
    const stream = new WakeWordStream(models, { threshold: 0.5, confirmFrames: 1 })
    const first = await feed(stream, 25)
    expect(first[24].detected).toBe(true)
    stream.reset()
    const again = await feed(stream, 24)
    expect(again.every((r) => r.score === null)).toBe(true)
  })

  it('rejects chunks of the wrong size', async () => {
    const stream = new WakeWordStream(fakeModels().models, { threshold: 0.5, confirmFrames: 1 })
    await expect(stream.push(new Int16Array(100))).rejects.toThrow()
  })
})
