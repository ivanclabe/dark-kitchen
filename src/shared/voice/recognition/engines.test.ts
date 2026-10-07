// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

// ADR 0041 (D2): the browser recognizer says whether what it heard is settled.
class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 0
  onstart: (() => void) | null = null
  onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null
  onerror: (() => void) | null = null
  onend: (() => void) | null = null
  start() {
    FakeRecognition.last = this
  }
  stop() {}
}
;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
vi.mock('./voskModel', () => ({ isVoskSupported: () => false, loadVoskModel: async () => null }))

const { browserEngine } = await import('./engines')

const result = (transcript: string, isFinal: boolean) => ({ isFinal, 0: { transcript } })

describe('browser recognizer (ADR 0041)', () => {
  it('delivers the whole transcript and whether its last part is settled', async () => {
    const heard: [string, boolean][] = []
    await browserEngine.start({ lang: 'es-CO', onTranscript: (t, final) => heard.push([t, final]), onStart: () => undefined, onEnd: () => undefined, onError: () => undefined })
    const r = FakeRecognition.last!
    r.onresult!({ results: [result('cuánto ', false)] })
    r.onresult!({ results: [result('cuánto vendimos', true)] })
    r.onresult!({ results: [result('cuánto vendimos', true), result(' hoy', false)] })
    expect(heard).toEqual([
      ['cuánto', false],
      ['cuánto vendimos', true],
      ['cuánto vendimos hoy', false],
    ])
  })
})
