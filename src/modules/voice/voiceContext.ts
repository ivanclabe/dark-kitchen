import type { SpokenText } from '@/shared/voice/hooks'
import type { RecognizerId } from '@/shared/voice/recognition/preference'
import type { SpeechPriority } from '@/shared/voice/speechQueue'
import type { WakeWordState } from '@/shared/voice/wakeWord/useWakeWord'
import { createContext, use, useEffect, useRef } from 'react'
import type { VoiceHandler, VoiceReply, VoiceState } from './types'

/** Silence that closes a phrase said to Quanela (as the kitchen commands always had). */
export const VOICE_PHRASE_DELAY_MS = 1800
/** Silence that sends a dictated question in Copilot (ADR 0033). */
export const DICTATION_DELAY_MS = 1500
/** After «Oye Quanela»: how long to wait for the phrase to start (ADR 0016, D6). */
export const HANDS_FREE_WINDOW_MS = 5000
/** Conversation (ADR 0038): after an answer, how long Quanela keeps listening for the next question. */
export const FOLLOW_UP_WINDOW_MS = 8000
/** Room echo after Quanela stops speaking, before listening again (so it does not hear itself). */
export const ECHO_TAIL_MS = 600
/** Safety limits of one conversation. */
export const CONVERSATION_MAX_TURNS = 10
export const CONVERSATION_MAX_MS = 3 * 60_000

export interface Dictation {
  onTranscript: (text: string) => void
  onDone: (text: string) => void
}

export interface VoiceContextValue {
  /** This person can talk to Quanela here (feature, a recognizer on this device and someone to answer). */
  available: boolean
  /** The recognizer chosen on this device works in this browser. */
  supported: boolean
  engine: RecognizerId
  state: VoiceState
  /** Listening for a question typed by voice in Copilot (dictation) rather than a phrase to route. */
  dictating: boolean
  liveTranscript: string
  lastTranscript: string
  lastReply: VoiceReply | null
  handsFree: {
    allowed: boolean
    on: boolean
    setOn: (on: boolean) => void
    paused: boolean
    togglePause: () => void
    state: WakeWordState
    error: string | null
  }
  /**
   * The conversation started by «Oye Quanela» (ADR 0038): after each answer it
   * listens again, without the wake phrase, until silence or «gracias».
   */
  conversation: {
    active: boolean
    /** Device preference: keep listening after answering (on by default). */
    enabled: boolean
    setEnabled: (on: boolean) => void
    end: () => void
  }
  /** Spoken replies to what is said (device preference, on by default). */
  replies: boolean
  setReplies: (on: boolean) => void
  /** The account lets Quanela speak (voice_speech). */
  speechAllowed: boolean
  listen: () => void
  dictate: (d: Dictation) => void
  stop: () => void
  /** A phrase as if it had been heard (the kitchen's text test). */
  submitText: (text: string) => void
  say: (text: SpokenText, priority?: SpeechPriority) => boolean
  registerHandler: (handler: VoiceHandler) => () => void
}

export const VoiceContext = createContext<VoiceContextValue | null>(null)

export function useVoice(): VoiceContextValue {
  const ctx = use(VoiceContext)
  if (!ctx) throw new Error('useVoice must be used inside VoiceProvider')
  return ctx
}

/** Registers what a screen understands by voice, while it is mounted. */
export function useVoiceHandler(handler: VoiceHandler | null) {
  const { registerHandler } = useVoice()
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  const id = handler?.id ?? null
  const grammar = handler?.grammar
  const fallback = handler?.fallback
  useEffect(() => {
    if (!id) return
    return registerHandler({
      id,
      grammar,
      fallback,
      matches: (text) => ref.current?.matches?.(text) ?? false,
      handle: (text, ctx) => ref.current?.handle(text, ctx) ?? Promise.resolve(null),
    })
  }, [id, grammar, fallback, registerHandler])
}

