/**
 * Microphone → 16 kHz int16 chunks of 80 ms (1280 samples) for the wake word
 * (ADR 0016). Runs on the audio thread. The device rate (44.1/48 kHz) is
 * converted with band-limited interpolation: a windowed-sinc kernel (cut at
 * 7.2 kHz) evaluated at each output instant, from a table of 128 phases.
 * Loaded with audioWorklet.addModule(); plain JS on purpose (no bundling).
 */
const OUT_RATE = 16000
const CHUNK = 1280
const PHASES = 128

class WakeWordCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / OUT_RATE
    this.passthrough = sampleRate === OUT_RATE
    this.half = Math.ceil(8 * this.ratio)
    const fc = (0.45 * OUT_RATE) / sampleRate
    const taps = 2 * this.half
    this.table = new Float32Array((PHASES + 1) * taps)
    for (let p = 0; p <= PHASES; p++) {
      let sum = 0
      for (let k = 0; k < taps; k++) {
        const t = k - this.half + 1 - p / PHASES
        const x = 2 * fc * t
        const sinc = t === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
        const w = t / this.half
        const blackman = Math.abs(w) >= 1 ? 0 : 0.42 + 0.5 * Math.cos(Math.PI * w) + 0.08 * Math.cos(2 * Math.PI * w)
        const h = 2 * fc * sinc * blackman
        this.table[p * taps + k] = h
        sum += h
      }
      for (let k = 0; k < taps; k++) this.table[p * taps + k] /= sum
    }
    this.hist = new Float32Array(0)
    this.base = 0
    this.t = 0
    this.out = new Int16Array(CHUNK)
    this.outLen = 0
  }

  emit(value) {
    const v = value > 1 ? 1 : value < -1 ? -1 : value
    this.out[this.outLen++] = Math.round(v * 32767)
    if (this.outLen === CHUNK) {
      this.port.postMessage(this.out, [this.out.buffer])
      this.out = new Int16Array(CHUNK)
      this.outLen = 0
    }
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input) return true
    if (this.passthrough) {
      for (let i = 0; i < input.length; i++) this.emit(input[i])
      return true
    }
    const joined = new Float32Array(this.hist.length + input.length)
    joined.set(this.hist)
    joined.set(input, this.hist.length)
    this.hist = joined
    const taps = 2 * this.half
    const end = this.base + this.hist.length
    while (Math.floor(this.t) + this.half < end) {
      let i0 = Math.floor(this.t)
      let p = Math.round((this.t - i0) * PHASES)
      if (p === PHASES) {
        i0 += 1
        p = 0
      }
      let acc = 0
      const row = p * taps
      for (let k = 0; k < taps; k++) {
        const idx = i0 + k - this.half + 1 - this.base
        if (idx >= 0) acc += this.hist[idx] * this.table[row + k]
      }
      this.emit(acc)
      this.t += this.ratio
    }
    const keepFrom = Math.max(0, Math.floor(this.t) - this.half - this.base)
    if (keepFrom > 0) {
      this.hist = this.hist.slice(keepFrom)
      this.base += keepFrom
    }
    return true
  }
}

registerProcessor('wake-word-capture', WakeWordCapture)
