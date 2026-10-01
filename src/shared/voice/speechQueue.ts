import type { UtteranceParams } from './resolveVoice'

/**
 * One speech queue for the whole app (ADR 0014, 9.5):
 *   - never overlaps and never cuts what is being said,
 *   - priorities: command (someone just asked) > alert > insight; a higher
 *     priority jumps ahead in the queue, without interrupting,
 *   - no repeats of a text already queued, drops stale messages (default
 *     20 s) and keeps at most `maxPending` waiting (the lowest priority goes),
 *   - clear() (mute) empties it at once,
 *   - measures the device latency: handed to the engine → it starts speaking
 *     (waiting behind another message is by design and not counted).
 */
export type SpeechPriority = 'command' | 'alert' | 'insight'

const RANK: Record<SpeechPriority, number> = { command: 0, alert: 1, insight: 2 }

export interface SpeechEngine {
  available(): boolean
  speak(text: string, params: UtteranceParams, handlers: { onStart: () => void; onEnd: () => void }): void
  cancel(): void
}

interface QueueItem {
  id: number
  text: string
  priority: SpeechPriority
  params: UtteranceParams
  enqueuedAt: number
}

export interface SpeechQueueOptions {
  maxPending?: number
  staleMs?: number
  now?: () => number
  /** Upper bound for one utterance if the engine never reports its end. */
  maxUtteranceMs?: (text: string) => number
}

export class SpeechQueue {
  private pending: QueueItem[] = []
  private current: QueueItem | null = null
  private nextId = 1
  private watchdog: ReturnType<typeof setTimeout> | null = null
  private readonly samples: number[] = []
  private lastActiveAt = Number.NEGATIVE_INFINITY
  private readonly maxPending: number
  private readonly staleMs: number
  private readonly now: () => number
  private readonly maxUtteranceMs: (text: string) => number
  private readonly engine: SpeechEngine

  constructor(engine: SpeechEngine, options: SpeechQueueOptions = {}) {
    this.engine = engine
    this.maxPending = options.maxPending ?? 3
    this.staleMs = options.staleMs ?? 20_000
    this.now = options.now ?? (() => Date.now())
    this.maxUtteranceMs = options.maxUtteranceMs ?? ((text) => Math.max(6_000, text.length * 150))
  }

  /** Returns false when the message is not queued (duplicate, no engine, or lowest priority with a full queue). */
  enqueue(text: string, priority: SpeechPriority, params: UtteranceParams): boolean {
    const clean = text.trim()
    if (!clean || !this.engine.available()) return false
    if (this.current?.text === clean || this.pending.some((p) => p.text === clean)) return false

    const item: QueueItem = { id: this.nextId++, text: clean, priority, params, enqueuedAt: this.now() }
    this.pending.push(item)
    this.pending.sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.enqueuedAt - b.enqueuedAt || a.id - b.id)
    if (this.pending.length > this.maxPending) {
      const dropped = this.pending.pop()
      if (dropped?.id === item.id) return false
    }
    this.pump()
    return true
  }

  /** Mute: stops the current message and forgets the pending ones. */
  clear(): void {
    this.pending = []
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
    if (this.current) {
      this.current = null
      this.lastActiveAt = this.now()
      this.engine.cancel()
    }
  }

  /**
   * True while something is being said and for `tailMs` after it ends (the
   * room still echoes it). The wake word stops listening meanwhile (ADR 0016).
   */
  isSpeaking(tailMs = 0): boolean {
    return this.current !== null || this.now() - this.lastActiveAt < tailMs
  }

  get size(): number {
    return this.pending.length + (this.current ? 1 : 0)
  }

  /** Device latency in ms (engine call → start of speech), most recent last (max 20). */
  get latencySamples(): readonly number[] {
    return this.samples
  }

  private pump(): void {
    if (this.current) return
    const now = this.now()
    this.pending = this.pending.filter((p) => now - p.enqueuedAt <= this.staleMs)
    const item = this.pending.shift()
    if (!item) return
    this.current = item
    let started = false
    const finish = () => {
      if (this.current?.id !== item.id) return
      if (this.watchdog) clearTimeout(this.watchdog)
      this.watchdog = null
      this.current = null
      this.lastActiveAt = this.now()
      this.pump()
    }
    this.watchdog = setTimeout(() => {
      if (this.current?.id !== item.id) return
      this.engine.cancel()
      finish()
    }, this.maxUtteranceMs(item.text))
    const handedAt = this.now()
    try {
      this.engine.speak(item.text, item.params, {
        onStart: () => {
          if (started) return
          started = true
          this.samples.push(this.now() - handedAt)
          if (this.samples.length > 20) this.samples.shift()
        },
        onEnd: finish,
      })
    } catch {
      // Speech is an extra on top of the visual feedback: never break the flow.
      finish()
    }
  }
}

/** Browser speech synthesis. */
export const deviceSpeechEngine: SpeechEngine = {
  available: () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  speak(text, params, { onStart, onEnd }) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = params.lang
    utterance.rate = params.rate
    utterance.pitch = params.pitch
    utterance.volume = params.volume
    if (params.voice) utterance.voice = params.voice as SpeechSynthesisVoice
    utterance.onstart = onStart
    utterance.onend = onEnd
    utterance.onerror = onEnd
    window.speechSynthesis.speak(utterance)
  },
  cancel() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  },
}

/** The app-wide queue. */
export const kitchenSpeech = new SpeechQueue(deviceSpeechEngine)
