/**
 * "Oye Quanela" streaming detector (ADR 0016). Same arithmetic as the Python
 * reference used for training (openWakeWord's streaming features):
 *
 *   chunk n (80 ms, 1280 int16 samples)
 *     → log-mel of [480 previous samples + chunk] = 8 frames × 32, then x/10 + 2
 *     → once 76 mel frames exist: one 96-d embedding (last 76 frames)
 *     → once 16 embeddings exist: one score (last 16 embeddings)
 *     → detected when `confirmFrames` consecutive scores reach `threshold`,
 *       then quiet for `refractoryChunks` so one phrase fires once.
 *
 * The three models are injected (ONNX in the browser, fakes in tests).
 */
export const CHUNK_SAMPLES = 1280
export const CONTEXT_SAMPLES = 480
export const MEL_FRAMES_PER_CHUNK = 8
export const MEL_BINS = 32
export const EMBEDDING_WINDOW = 76
export const EMBEDDING_SIZE = 96
export const FEATURE_FRAMES = 16

export interface WakeWordModels {
  /** [1760] int16-scaled samples → [8 × 32] raw log-mel (before x/10 + 2). */
  melspectrogram(samples: Float32Array): Promise<Float32Array>
  /** [76 × 32] mel → [96]. */
  embedding(mel: Float32Array): Promise<Float32Array>
  /** [16 × 96] embeddings → probability 0–1. */
  classifier(features: Float32Array): Promise<number>
}

export interface WakeWordTuning {
  threshold: number
  confirmFrames: number
  /** Chunks ignored after a detection (25 = 2 s). */
  refractoryChunks?: number
}

export interface ChunkResult {
  /** Null while warming up (the first ~2 s after start or reset). */
  score: number | null
  detected: boolean
}

export class WakeWordStream {
  private readonly models: WakeWordModels
  private tuning: Required<WakeWordTuning>
  private context = new Float32Array(CONTEXT_SAMPLES)
  private mel: Float32Array[] = []
  private embeddings: Float32Array[] = []
  private above = 0
  private quiet = 0

  constructor(models: WakeWordModels, tuning: WakeWordTuning) {
    this.models = models
    this.tuning = { refractoryChunks: 25, ...tuning }
  }

  setTuning(tuning: WakeWordTuning): void {
    this.tuning = { ...this.tuning, ...tuning }
  }

  /** Forget the audio so far (after a pause, so old sound never mixes with new). */
  reset(): void {
    this.context = new Float32Array(CONTEXT_SAMPLES)
    this.mel = []
    this.embeddings = []
    this.above = 0
    this.quiet = 0
  }

  async push(chunk: Int16Array): Promise<ChunkResult> {
    if (chunk.length !== CHUNK_SAMPLES) throw new Error(`chunk must have ${CHUNK_SAMPLES} samples`)
    const samples = new Float32Array(CONTEXT_SAMPLES + CHUNK_SAMPLES)
    samples.set(this.context)
    for (let i = 0; i < CHUNK_SAMPLES; i++) samples[CONTEXT_SAMPLES + i] = chunk[i]
    this.context = samples.slice(CHUNK_SAMPLES)

    const raw = await this.models.melspectrogram(samples)
    for (let f = 0; f < MEL_FRAMES_PER_CHUNK; f++) {
      const frame = new Float32Array(MEL_BINS)
      for (let b = 0; b < MEL_BINS; b++) frame[b] = raw[f * MEL_BINS + b] / 10 + 2
      this.mel.push(frame)
    }
    if (this.mel.length > EMBEDDING_WINDOW) this.mel.splice(0, this.mel.length - EMBEDDING_WINDOW)
    if (this.mel.length < EMBEDDING_WINDOW) return this.idle()

    const window = new Float32Array(EMBEDDING_WINDOW * MEL_BINS)
    this.mel.forEach((frame, i) => window.set(frame, i * MEL_BINS))
    this.embeddings.push(await this.models.embedding(window))
    if (this.embeddings.length > FEATURE_FRAMES) this.embeddings.shift()
    if (this.embeddings.length < FEATURE_FRAMES) return this.idle()

    const features = new Float32Array(FEATURE_FRAMES * EMBEDDING_SIZE)
    this.embeddings.forEach((e, i) => features.set(e, i * EMBEDDING_SIZE))
    const score = await this.models.classifier(features)

    if (this.quiet > 0) {
      this.quiet -= 1
      return { score, detected: false }
    }
    this.above = score >= this.tuning.threshold ? this.above + 1 : 0
    if (this.above >= this.tuning.confirmFrames) {
      this.above = 0
      this.quiet = this.tuning.refractoryChunks
      return { score, detected: true }
    }
    return { score, detected: false }
  }

  private idle(): ChunkResult {
    return { score: null, detected: false }
  }
}
