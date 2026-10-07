// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { VoiceHandler, VoiceTurn } from './types'

// ADR 0033: «Oye Quanela» owns the microphone for the whole app and routes each phrase.
const state = vi.hoisted(() => ({
  engine: 'browser' as 'browser' | 'vosk',
  onTranscript: null as ((t: string, final?: boolean) => void) | null,
  onStart: null as (() => void) | null,
  tone: null as Promise<void> | null,
  turns: [] as VoiceTurn[],
  prepared: 0,
  onDetect: null as (() => void) | null,
  started: 0,
  stopped: 0,
  said: [] as { text: unknown; priority: string }[],
  features: new Set<string>(['voice_wake_word', 'voice_speech']),
}))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ canUseFeature: (k: string) => state.features.has(k), feature: () => null }),
}))
vi.mock('@/shared/voice/hooks', () => ({
  useQuanelaVoice: () => ({ allowed: true, say: (text: unknown, priority: string) => (state.said.push({ text, priority }), true) }),
}))
vi.mock('@/shared/voice/recognition/preference', () => ({ useRecognizerPreference: () => [state.engine, vi.fn()] }))
vi.mock('@/shared/voice/recognition/engines', () => ({ engineFor: () => ({ supported: () => true }) }))
vi.mock('@/shared/voice/recognition/useSpeechRecognition', () => ({
  useSpeechRecognition: ({ onTranscriptChange, onStart }: { onTranscriptChange: (t: string, final?: boolean) => void; onStart?: () => void }) => {
    state.onTranscript = onTranscriptChange
    state.onStart = onStart ?? null
    return { supported: true, engine: state.engine, listening: false, error: null, start: async () => void state.started++, stop: () => void state.stopped++ }
  },
}))
vi.mock('@/shared/voice/wakeWord/useWakeWord', () => ({
  useWakeWord: ({ onDetect }: { onDetect: () => void }) => ((state.onDetect = onDetect), { state: 'listening', error: null }),
}))
vi.mock('@/shared/voice/wakeWord/wakeWordModel', () => ({ isWakeWordSupported: () => true }))
vi.mock('@/shared/voice/wakeWord/tone', () => ({ playWakeTone: () => state.tone ?? Promise.resolve(), playFollowUpTone: () => state.tone ?? Promise.resolve() }))
vi.mock('@/shared/voice/wakeWord/preference', () => ({ useWakeWordPreference: () => [true, vi.fn()] }))

const { VoiceProvider } = await import('./VoiceProvider')
const {
  useVoice,
  useVoiceHandler,
  VOICE_PHRASE_DELAY_MS,
  VOICE_FINAL_DELAY_MS,
  DICTATION_DELAY_MS,
  DICTATION_FINAL_DELAY_MS,
  HANDS_FREE_WINDOW_MS,
  FOLLOW_UP_WINDOW_MS,
  CONVERSATION_MAX_TURNS,
} = await import('./voiceContext')

const calls: string[] = []
const kitchen: VoiceHandler = {
  id: 'kitchen',
  grammar: '["pedido"]',
  matches: (t) => /\d{4}/.test(t) && /listo/.test(t),
  handle: async (t) => (calls.push(`kitchen:${t}`), { tone: 'success', message: 'Pedido 1042 listo.', spoken: 'Pedido 1042 listo.', priority: 'command', toast: true }),
}
const copilot: VoiceHandler = {
  id: 'copilot',
  fallback: true,
  prepare: () => void state.prepared++,
  handle: async (t, { turn }) => (
    calls.push(`copilot:${t}`), state.turns.push(turn), { tone: 'success', message: 'Vendiste $20.000.', spoken: 'Vendiste veinte mil pesos.', priority: 'answer' }
  ),
}

let api: ReturnType<typeof useVoice> | null = null
const setApi = (v: ReturnType<typeof useVoice>) => {
  api = v
}
function Probe({ withKitchen = true }: { withKitchen?: boolean }) {
  const voice = useVoice()
  useEffect(() => setApi(voice))
  useVoiceHandler(copilot)
  useVoiceHandler(withKitchen ? kitchen : null)
  return <p>{`state:${voice.state} reply:${voice.lastReply?.message ?? ''} conversation:${voice.conversation.active}`}</p>
}

function renderVoice(withKitchen = true) {
  return render(
    <ToastProvider>
      <VoiceProvider>
        <Probe withKitchen={withKitchen} />
      </VoiceProvider>
    </ToastProvider>,
  )
}

async function say(text: string, wait = VOICE_PHRASE_DELAY_MS) {
  await act(async () => state.onTranscript!(text))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(wait + 10)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  state.engine = 'browser'
  state.started = 0
  state.stopped = 0
  state.said = []
  state.tone = null
  state.turns = []
  state.prepared = 0
  calls.length = 0
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('«Oye Quanela» (ADR 0033)', () => {
  it('a kitchen command goes to the kitchen and is answered aloud as a command', async () => {
    renderVoice()
    await act(async () => api!.listen())
    expect(state.started).toBe(1)
    await say('pedido 1042 listo')
    expect(calls).toEqual(['kitchen:pedido 1042 listo'])
    expect(state.said).toEqual([{ text: 'Pedido 1042 listo.', priority: 'command' }])
    expect(screen.getByText(/state:success reply:Pedido 1042 listo\./)).toBeTruthy()
  })

  it('a question goes to Copilot and its answer is read after the kitchen alerts', async () => {
    renderVoice()
    await say('¿cuánto vendimos hoy?')
    expect(calls).toEqual(['copilot:¿cuánto vendimos hoy?'])
    expect(state.said).toEqual([{ text: 'Vendiste veinte mil pesos.', priority: 'answer' }])
  })

  it('nothing runs until the phrase is complete (a pause of silence)', async () => {
    renderVoice()
    await act(async () => state.onTranscript!('pedido'))
    await act(async () => state.onTranscript!('pedido 1042'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_PHRASE_DELAY_MS - 100)
    })
    expect(calls).toEqual([])
    await say('pedido 1042 listo')
    expect(calls).toEqual(['kitchen:pedido 1042 listo'])
  })

  it('«cancela» alone stops, without asking anyone', async () => {
    renderVoice()
    await say('cancela')
    expect(calls).toEqual([])
    expect(screen.getByText(/state:idle/)).toBeTruthy()
  })

  it('with the offline recognizer outside Cocina it says how to ask questions', async () => {
    state.engine = 'vosk'
    renderVoice(false)
    await act(async () => api!.listen())
    expect(state.started).toBe(0)
    expect(screen.getByText(/cambia el reconocedor a «navegador»/)).toBeTruthy()
  })

  it('dictation fills Copilot\'s field and sends after a pause, without routing', async () => {
    renderVoice()
    const typed: string[] = []
    const done: string[] = []
    await act(async () => api!.dictate({ onTranscript: (t) => typed.push(t), onDone: (t) => done.push(t) }))
    await say('qué plato deja más margen', DICTATION_DELAY_MS)
    expect(typed).toEqual(['qué plato deja más margen'])
    expect(done).toEqual(['qué plato deja más margen'])
    expect(calls).toEqual([])
  })

  it('«Oye Quanela» opens a short window; nobody speaks: back to waiting', async () => {
    renderVoice()
    await act(async () => {
      state.onDetect!()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(state.started).toBe(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HANDS_FREE_WINDOW_MS + 10)
    })
    expect(state.stopped).toBeGreaterThan(0)
    expect(screen.getByText(/state:idle/)).toBeTruthy()
  })

  it('this device does not read replies: shown, not spoken', async () => {
    localStorage.setItem('dk-voice-replies', 'off')
    renderVoice()
    await say('¿cuánto vendimos hoy?')
    expect(calls).toHaveLength(1)
    expect(state.said).toEqual([])
  })

  it('the kitchen\'s old «respuesta hablada» choice is kept', async () => {
    localStorage.setItem('dk-kitchen-voice-tts', 'off')
    renderVoice()
    await say('¿cuánto vendimos hoy?')
    expect(state.said).toEqual([])
    expect(localStorage.getItem('dk-voice-replies')).toBe('off')
  })
})

/** «Oye Quanela», then the question; waits for the answer and for the follow-up turn to start. */
async function wakeAndAsk(text: string) {
  await act(async () => {
    state.onDetect!()
    await vi.advanceTimersByTimeAsync(0)
  })
  await say(text)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
}

describe('conversation by voice (ADR 0038)', () => {
  it('after «Oye Quanela» and an answer, it listens again without the wake phrase', async () => {
    renderVoice()
    await wakeAndAsk('¿cuánto vendimos hoy?')
    expect(calls).toEqual(['copilot:¿cuánto vendimos hoy?'])
    expect(state.started).toBe(2)
    expect(screen.getByText(/conversation:true/)).toBeTruthy()
    await say('¿y ayer?')
    expect(calls).toEqual(['copilot:¿cuánto vendimos hoy?', 'copilot:¿y ayer?'])
  })

  it('silence after the answer ends the conversation, quietly', async () => {
    renderVoice()
    await wakeAndAsk('¿cuánto vendimos hoy?')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOLLOW_UP_WINDOW_MS + 10)
    })
    expect(screen.getByText(/state:idle .*conversation:false/)).toBeTruthy()
    expect(calls).toHaveLength(1)
  })

  it('«gracias» closes it kindly; «para» stops it', async () => {
    renderVoice()
    await wakeAndAsk('¿cuánto vendimos hoy?')
    await say('gracias')
    expect(screen.getByText(/reply:Con gusto\. conversation:false/)).toBeTruthy()
    expect(state.said.at(-1)).toEqual({ text: 'Con gusto.', priority: 'answer' })
    await wakeAndAsk('¿cuánto vendimos hoy?')
    await say('para')
    expect(screen.getByText(/conversation:false/)).toBeTruthy()
    expect(calls).toHaveLength(2)
  })

  it('a stray word after an answer is not a question: nothing is asked', async () => {
    renderVoice(false)
    await wakeAndAsk('¿cuánto vendimos hoy?')
    await say('eh')
    expect(calls).toHaveLength(1)
    expect(screen.getByText(/conversation:false/)).toBeTruthy()
  })

  it('a kitchen command also works inside the conversation', async () => {
    renderVoice()
    await wakeAndAsk('¿cuánto vendimos hoy?')
    await say('pedido 1042 listo')
    expect(calls.at(-1)).toBe('kitchen:pedido 1042 listo')
    expect(screen.getByText(/conversation:true/)).toBeTruthy()
  })

  it('«Hablar ahora» is one phrase only: no conversation', async () => {
    renderVoice()
    await act(async () => api!.listen())
    await say('¿cuánto vendimos hoy?')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(state.started).toBe(1)
    expect(screen.getByText(/conversation:false/)).toBeTruthy()
  })

  it('with «Seguir escuchando» off on this device, it answers once, as before', async () => {
    localStorage.setItem('dk-voice-follow-up', 'off')
    renderVoice()
    await wakeAndAsk('¿cuánto vendimos hoy?')
    expect(state.started).toBe(1)
    expect(screen.getByText(/conversation:false/)).toBeTruthy()
  })

  it('a safety limit of turns', async () => {
    renderVoice()
    await wakeAndAsk('pregunta número uno')
    for (let i = 2; i <= CONVERSATION_MAX_TURNS; i++) {
      await say(`pregunta número ${i}`)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
    }
    expect(calls).toHaveLength(CONVERSATION_MAX_TURNS)
    expect(screen.getByText(/conversation:false/)).toBeTruthy()
  })

  it('«Terminar conversación» ends it and frees the microphone', async () => {
    renderVoice()
    await wakeAndAsk('¿cuánto vendimos hoy?')
    const stoppedBefore = state.stopped
    await act(async () => api!.conversation.end())
    expect(screen.getByText(/state:idle .*conversation:false/)).toBeTruthy()
    expect(state.stopped).toBeGreaterThan(stoppedBefore)
  })
})


describe('latency (ADR 0041)', () => {
  it('settled text closes after a short pause; provisional text waits longer', async () => {
    renderVoice()
    await act(async () => state.onTranscript!('cuánto vendimos hoy', true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_FINAL_DELAY_MS + 10)
    })
    expect(calls).toEqual(['copilot:cuánto vendimos hoy'])

    await act(async () => api!.listen())
    await act(async () => state.onTranscript!('y ayer', false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_FINAL_DELAY_MS + 10)
    })
    expect(calls).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_PHRASE_DELAY_MS - VOICE_FINAL_DELAY_MS)
    })
    expect(calls).toEqual(['copilot:cuánto vendimos hoy', 'copilot:y ayer'])
  })

  it('a pause after settled words does not cut the phrase: a new word starts the count again', async () => {
    renderVoice()
    await act(async () => state.onTranscript!('pedido', true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_FINAL_DELAY_MS - 100)
    })
    await act(async () => state.onTranscript!('pedido 1042', false))
    await act(async () => state.onTranscript!('pedido 1042 listo', true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_FINAL_DELAY_MS + 10)
    })
    expect(calls).toEqual(['kitchen:pedido 1042 listo'])
  })

  it('the same transcript again does not stretch the pause', async () => {
    renderVoice()
    await act(async () => state.onTranscript!('cuánto vendimos', true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_FINAL_DELAY_MS - 100)
    })
    await act(async () => state.onTranscript!('cuánto vendimos', true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(calls).toEqual(['copilot:cuánto vendimos'])
  })

  it('dictation: settled text is sent after its own short pause', async () => {
    renderVoice()
    const done: string[] = []
    await act(async () => api!.dictate({ onTranscript: () => undefined, onDone: (t) => done.push(t) }))
    await act(async () => state.onTranscript!('qué plato deja más margen', true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DICTATION_FINAL_DELAY_MS - 50)
    })
    expect(done).toEqual([])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(done).toEqual(['qué plato deja más margen'])
    expect(DICTATION_FINAL_DELAY_MS).toBeLessThan(DICTATION_DELAY_MS)
  })

  it('it listens while the tone sounds (does not wait for it)', async () => {
    state.tone = new Promise(() => undefined)
    renderVoice()
    await act(async () => {
      state.onDetect!()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(state.started).toBe(1)
  })

  it('«Oye Quanela» gets the answerers ready; the offline recognizer does not (it cannot ask Copilot)', async () => {
    renderVoice()
    await act(async () => {
      state.onDetect!()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(state.prepared).toBe(1)
    cleanup()
    state.engine = 'vosk'
    renderVoice()
    await act(async () => {
      state.onDetect!()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(state.prepared).toBe(1)
  })

  it('the handler learns how the phrase was heard: by the wake phrase, how long to listen and to close it', async () => {
    renderVoice()
    await act(async () => {
      state.onDetect!()
      await vi.advanceTimersByTimeAsync(250)
      state.onStart!()
    })
    await act(async () => state.onTranscript!('cuánto vendimos hoy', true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_FINAL_DELAY_MS + 10)
    })
    expect(state.turns[0]).toMatchObject({ wake: true, followUp: false, listenMs: 250 })
    expect(state.turns[0].endpointMs).toBeGreaterThanOrEqual(VOICE_FINAL_DELAY_MS)
    expect(state.turns[0].lastWordAt).toEqual(expect.any(Number))
  })

  it('a follow-up of the conversation is marked as such', async () => {
    renderVoice()
    await wakeAndAsk('¿cuánto vendimos hoy?')
    await say('¿y ayer?')
    expect(state.turns.map((t) => [t.wake, t.followUp])).toEqual([
      [true, false],
      [false, true],
    ])
  })
})
