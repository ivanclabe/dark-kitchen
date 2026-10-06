// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { VoiceHandler } from './types'

// ADR 0033: «Oye Quanela» owns the microphone for the whole app and routes each phrase.
const state = vi.hoisted(() => ({
  engine: 'browser' as 'browser' | 'vosk',
  onTranscript: null as ((t: string) => void) | null,
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
  useSpeechRecognition: ({ onTranscriptChange }: { onTranscriptChange: (t: string) => void }) => {
    state.onTranscript = onTranscriptChange
    return { supported: true, engine: state.engine, listening: false, error: null, start: async () => void state.started++, stop: () => void state.stopped++ }
  },
}))
vi.mock('@/shared/voice/wakeWord/useWakeWord', () => ({
  useWakeWord: ({ onDetect }: { onDetect: () => void }) => ((state.onDetect = onDetect), { state: 'listening', error: null }),
}))
vi.mock('@/shared/voice/wakeWord/wakeWordModel', () => ({ isWakeWordSupported: () => true }))
vi.mock('@/shared/voice/wakeWord/tone', () => ({ playWakeTone: async () => undefined }))
vi.mock('@/shared/voice/wakeWord/preference', () => ({ useWakeWordPreference: () => [true, vi.fn()] }))

const { VoiceProvider } = await import('./VoiceProvider')
const { useVoice, useVoiceHandler, VOICE_PHRASE_DELAY_MS, DICTATION_DELAY_MS, HANDS_FREE_WINDOW_MS } = await import('./voiceContext')

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
  handle: async (t) => (calls.push(`copilot:${t}`), { tone: 'success', message: 'Vendiste $20.000.', spoken: 'Vendiste veinte mil pesos.', priority: 'answer' }),
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
  return <p>{`state:${voice.state} reply:${voice.lastReply?.message ?? ''}`}</p>
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
