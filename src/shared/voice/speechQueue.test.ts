import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UtteranceParams } from './resolveVoice'
import { SpeechQueue, type SpeechEngine } from './speechQueue'

const params: UtteranceParams = { lang: 'es-CO', rate: 1, pitch: 1, volume: 1, voice: null }

/** Fake engine: records what is spoken; the test decides when each utterance starts and ends. */
function fakeEngine() {
  const spoken: string[] = []
  let handlers: { onStart: () => void; onEnd: () => void } | null = null
  const engine: SpeechEngine = {
    available: () => true,
    speak: (text, _params, h) => {
      spoken.push(text)
      handlers = h
    },
    cancel: vi.fn(),
  }
  return {
    engine,
    spoken,
    start: () => handlers?.onStart(),
    end: () => handlers?.onEnd(),
  }
}

describe('SpeechQueue (ADR 0014, 9.5)', () => {
  let now = 0
  beforeEach(() => {
    now = 1_000
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  const queue = (engine: SpeechEngine, maxPending = 3) => new SpeechQueue(engine, { now: () => now, maxPending })

  it('never overlaps nor cuts: the next message waits for the current one', () => {
    const f = fakeEngine()
    const q = queue(f.engine)
    q.enqueue('Pedido 1042 listo.', 'command', params)
    q.enqueue('Pedido 1043 listo.', 'command', params)
    expect(f.spoken).toEqual(['Pedido 1042 listo.'])
    expect(f.engine.cancel).not.toHaveBeenCalled()
    f.end()
    expect(f.spoken).toEqual(['Pedido 1042 listo.', 'Pedido 1043 listo.'])
  })

  it('a command jumps ahead of alerts and insights, without interrupting', () => {
    const f = fakeEngine()
    const q = queue(f.engine)
    q.enqueue('Sugerencia: agrupa las papas.', 'insight', params)
    q.enqueue('Pedido 7: 20 minutos en cola.', 'alert', params)
    q.enqueue('Pedido 1044 cancelado.', 'command', params)
    f.end()
    f.end()
    expect(f.spoken).toEqual(['Sugerencia: agrupa las papas.', 'Pedido 1044 cancelado.', 'Pedido 7: 20 minutos en cola.'])
  })

  it('does not repeat a text already queued or being said', () => {
    const f = fakeEngine()
    const q = queue(f.engine)
    expect(q.enqueue('Pedido 1 listo.', 'command', params)).toBe(true)
    expect(q.enqueue('Pedido 1 listo.', 'command', params)).toBe(false)
    expect(q.size).toBe(1)
  })

  it('drops stale messages (older than 20 s)', () => {
    const f = fakeEngine()
    const q = queue(f.engine)
    q.enqueue('Uno.', 'command', params)
    q.enqueue('Viejo.', 'alert', params)
    now += 25_000
    f.end()
    expect(f.spoken).toEqual(['Uno.'])
    expect(q.size).toBe(0)
  })

  it('keeps at most N waiting: the lowest priority goes', () => {
    const f = fakeEngine()
    const q = queue(f.engine, 2)
    q.enqueue('Hablando.', 'command', params)
    q.enqueue('Sugerencia.', 'insight', params)
    q.enqueue('Alerta.', 'alert', params)
    expect(q.enqueue('Comando.', 'command', params)).toBe(true) // pushes the insight out
    expect(q.enqueue('Otra sugerencia.', 'insight', params)).toBe(false) // lowest priority with a full queue
    f.end()
    f.end()
    expect(f.spoken).toEqual(['Hablando.', 'Comando.', 'Alerta.'])
  })

  it('clear() (mute) stops what is said and forgets the rest', () => {
    const f = fakeEngine()
    const q = queue(f.engine)
    q.enqueue('Uno.', 'command', params)
    q.enqueue('Dos.', 'alert', params)
    q.clear()
    expect(f.engine.cancel).toHaveBeenCalled()
    expect(q.size).toBe(0)
    f.end() // a late end event of the cancelled utterance is ignored
    expect(f.spoken).toEqual(['Uno.'])
  })

  it('measures device latency (engine call → start), not the wait in the queue', () => {
    const f = fakeEngine()
    const q = queue(f.engine)
    q.enqueue('Pedido 5 listo.', 'command', params)
    q.enqueue('Pedido 6 listo.', 'command', params)
    now += 40
    f.start()
    now += 2_000 // "Pedido 6" waits two seconds behind "Pedido 5"
    f.end()
    now += 30
    f.start()
    expect(q.latencySamples).toEqual([40, 30])
  })

  it('moves on if the engine never reports the end', () => {
    const f = fakeEngine()
    const q = queue(f.engine)
    q.enqueue('Uno.', 'command', params)
    q.enqueue('Dos.', 'command', params)
    vi.advanceTimersByTime(6_000)
    expect(f.spoken).toEqual(['Uno.', 'Dos.'])
  })

  it('does nothing without a speech engine', () => {
    const q = queue({ available: () => false, speak: vi.fn(), cancel: vi.fn() })
    expect(q.enqueue('Hola.', 'command', params)).toBe(false)
  })

  it('reports speaking while a message plays and for a tail after it (ADR 0016)', () => {
    const f = fakeEngine()
    const q = queue(f.engine)
    expect(q.isSpeaking(700)).toBe(false)
    q.enqueue('Pedido 1042 listo.', 'command', params)
    expect(q.isSpeaking()).toBe(true)
    f.end()
    expect(q.isSpeaking()).toBe(false)
    expect(q.isSpeaking(700)).toBe(true)
    now += 701
    expect(q.isSpeaking(700)).toBe(false)
  })
})
