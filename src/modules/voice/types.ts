import type { RecognizerId } from '@/shared/voice/recognition/preference'
import type { SpokenText } from '@/shared/voice/hooks'
import type { SpeechPriority } from '@/shared/voice/speechQueue'

/** What «Oye Quanela» is doing (ADR 0033). */
export type VoiceState = 'idle' | 'listening' | 'processing' | 'success' | 'error'

/** The answer to something said: shown, and spoken if this device reads replies. */
export interface VoiceReply {
  tone: 'success' | 'error' | 'info'
  message: string
  spoken?: SpokenText | null
  priority?: SpeechPriority
  /** Also as a toast (the kitchen commands, as before). */
  toast?: boolean
  /** A help article to open from the answer (ADR 0034: «Abrir guía»). */
  link?: { href: string; label: string }
}

/**
 * How the phrase was heard (ADR 0041, D1): what the voice took before the
 * handler got it. Times in ms; null when it does not apply (typed, no wake phrase).
 */
export interface VoiceTurn {
  /** Started by «Oye Quanela» (not the button or the shortcut). */
  wake: boolean
  /** A follow-up of a conversation (ADR 0038). */
  followUp: boolean
  /** From the start of the turn until the recognizer was listening. */
  listenMs: number | null
  /** From the last word heard until the phrase was closed. */
  endpointMs: number | null
  /** When the last word was heard (Date.now()): the start of «how long until Quanela speaks». */
  lastWordAt: number | null
}

/**
 * Something a screen understands while it is open (ADR 0033). The kitchen
 * registers its order commands; Copilot is the fallback for everything else.
 */
export interface VoiceHandler {
  id: string
  /** Vocabulary for offline recognizers (Vosk): only these handlers work with them. */
  grammar?: string
  /** Takes whatever no other handler took. */
  fallback?: boolean
  /** Is this phrase mine? (not asked of the fallback) */
  matches?: (text: string) => boolean
  /** «Oye Quanela» was heard: get ready while the person is still speaking (ADR 0041, D4). */
  prepare?: () => void
  handle: (text: string, ctx: { engine: RecognizerId; signal: AbortSignal; turn: VoiceTurn }) => Promise<VoiceReply | null>
}
