import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useToast } from '@/shared/ui/Toast'
import { useQuanelaVoice } from '@/shared/voice/hooks'
import { useRecognizerPreference } from '@/shared/voice/recognition/preference'
import { engineFor } from '@/shared/voice/recognition/engines'
import { useSpeechRecognition } from '@/shared/voice/recognition/useSpeechRecognition'
import { deviceSpeech } from '@/shared/voice/speechQueue'
import { useWakeWordPreference } from '@/shared/voice/wakeWord/preference'
import { playFollowUpTone, playWakeTone } from '@/shared/voice/wakeWord/tone'
import { wakeWordTuning } from '@/shared/voice/wakeWord/tuning'
import { useWakeWord } from '@/shared/voice/wakeWord/useWakeWord'
import { isWakeWordSupported } from '@/shared/voice/wakeWord/wakeWordModel'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVoiceFlag } from './prefs'
import { routeUtterance, stripWakePhrase } from './router'
import type { VoiceHandler, VoiceReply, VoiceState, VoiceTurn } from './types'
import {
  CONVERSATION_MAX_MS,
  CONVERSATION_MAX_TURNS,
  DICTATION_DELAY_MS,
  DICTATION_FINAL_DELAY_MS,
  ECHO_TAIL_MS,
  FOLLOW_UP_WINDOW_MS,
  HANDS_FREE_WINDOW_MS,
  VOICE_FINAL_DELAY_MS,
  VOICE_PHRASE_DELAY_MS,
  VoiceContext,
  type Dictation,
  type VoiceContextValue,
} from './voiceContext'

/** How long the result of a phrase stays shown. */
const RESULT_DISPLAY_MS = 4000

function speechErrorMessage(code: string): string {
  switch (code) {
    case 'no-speech':
      return 'No escuché nada.'
    case 'audio-capture':
      return 'No hay micrófono disponible.'
    case 'not-allowed':
      return 'Permiso de micrófono denegado. Actívalo en el navegador para hablarle a Quanela.'
    case 'engine-error':
      return 'No se pudo iniciar el reconocimiento sin internet.'
    default:
      return 'Error de reconocimiento de voz.'
  }
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

/**
 * «Oye Quanela» (ADR 0033): the voice of the whole app. The ONE owner of the
 * microphone — hands-free (the wake phrase, detected on the device), listening
 * (speech-to-text) and speaking (the device's speech queue). What is heard
 * goes to whoever understands it: the screen's handler (the kitchen's order
 * commands) or Copilot. Mounted once per account, in the app frame.
 *
 * Conversation (ADR 0038): after «Oye Quanela», once the answer has been
 * said (plus the room's echo), it listens again for the next question —
 * without the wake phrase — until silence, «gracias», «para», a hidden tab or
 * the safety limits.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const { canUseFeature, feature } = useActiveKitchen()
  const { show } = useToast()
  const voice = useQuanelaVoice()
  const [engineId] = useRecognizerPreference()
  const supported = engineFor(engineId).supported()
  const [handsFreeOn, setHandsFreeOn] = useWakeWordPreference()
  const [replies, setReplies] = useVoiceFlag('replies', true)
  const [followUp, setFollowUp] = useVoiceFlag('followUp', true)
  const visible = usePageVisible()

  const handlersRef = useRef(new Map<string, VoiceHandler>())
  const [handlers, setHandlers] = useState<VoiceHandler[]>([])
  const registerHandler = useCallback((handler: VoiceHandler) => {
    handlersRef.current.set(handler.id, handler)
    setHandlers([...handlersRef.current.values()])
    return () => {
      if (handlersRef.current.get(handler.id) === handler) handlersRef.current.delete(handler.id)
      setHandlers([...handlersRef.current.values()])
    }
  }, [])

  const [state, setState] = useState<VoiceState>('idle')
  const [dictating, setDictating] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [lastTranscript, setLastTranscript] = useState('')
  const [lastReply, setLastReply] = useState<VoiceReply | null>(null)
  const [paused, setPaused] = useState(false)
  const [conversing, setConversing] = useState(false)

  const modeRef = useRef<'route' | 'dictate'>('route')
  /** The conversation in course (null: none), and whether this listening turn is one of its follow-ups. */
  const conversationRef = useRef<{ turns: number; startedAt: number } | null>(null)
  const followUpTurnRef = useRef(false)
  /** ADR 0041 (D1): the moments of this listening turn, to measure where the time goes. */
  const turnRef = useRef<{ startedAt: number; wake: boolean; listeningAt: number | null; lastWordAt: number | null; lastText: string; lastFinal: boolean }>({
    startedAt: 0,
    wake: false,
    listeningAt: null,
    lastWordAt: null,
    lastText: '',
    lastFinal: false,
  })
  const followUpPrefRef = useRef(followUp)
  const dictationRef = useRef<Dictation | null>(null)
  const processingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const timers = useRef<{ debounce?: ReturnType<typeof setTimeout>; noSpeech?: ReturnType<typeof setTimeout>; reset?: ReturnType<typeof setTimeout>; follow?: ReturnType<typeof setTimeout> }>({})
  const handlersListRef = useRef(handlers)
  const repliesRef = useRef(replies)
  const sayRef = useRef(voice.say)
  useEffect(() => {
    handlersListRef.current = handlers
    repliesRef.current = replies
    followUpPrefRef.current = followUp
    sayRef.current = voice.say
  })

  // The offline recognizer only knows a handler's vocabulary (the kitchen's).
  const grammar = engineId === 'vosk' ? handlers.find((h) => h.grammar)?.grammar : undefined
  const voiceUsable = canUseFeature('voice_wake_word')
  const available = supported && handlers.length > 0 && (voiceUsable || handlers.some((h) => h.grammar))

  const clearTimer = (key: 'debounce' | 'noSpeech' | 'reset' | 'follow') => {
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = undefined
  }

  const present = useCallback(
    (reply: VoiceReply) => {
      setLastReply(reply)
      setState(reply.tone === 'error' ? 'error' : 'success')
      if (reply.toast) show(reply.tone === 'success' ? `✓ ${reply.message}` : reply.message, reply.tone === 'error' ? 'error' : reply.tone === 'success' ? 'success' : 'info')
      if (repliesRef.current && reply.spoken) sayRef.current(reply.spoken, reply.priority ?? 'command')
      clearTimer('reset')
      timers.current.reset = setTimeout(() => setState('idle'), RESULT_DISPLAY_MS)
    },
    [show],
  )

  const endConversation = useCallback(() => {
    conversationRef.current = null
    followUpTurnRef.current = false
    clearTimer('follow')
    setConversing(false)
  }, [])

  // Defined below (it starts a listening turn); called through a ref by the follow-up.
  const startSessionRef = useRef<(mode: 'route' | 'dictate', handsFree: boolean, followUpTurn?: boolean) => Promise<void>>(async () => undefined)

  /** After an answer in a conversation: when Quanela is done speaking (and the echo is gone), listen again. */
  const continueConversation = useCallback(() => {
    const c = conversationRef.current
    if (!c) return
    c.turns += 1
    if (c.turns >= CONVERSATION_MAX_TURNS || Date.now() - c.startedAt > CONVERSATION_MAX_MS) return endConversation()
    clearTimer('follow')
    const since = Date.now()
    const tick = () => {
      timers.current.follow = undefined
      if (!conversationRef.current) return
      // Still speaking (at most 30 s): wait. The microphone must not hear Quanela's own voice.
      if (deviceSpeech.isSpeaking(ECHO_TAIL_MS) && Date.now() - since < 30_000) {
        timers.current.follow = setTimeout(tick, 150)
        return
      }
      void startSessionRef.current('route', true, true)
    }
    timers.current.follow = setTimeout(tick, 150)
  }, [endConversation])

  // Defined below; the recognizer calls them through refs (it outlives renders).
  const onTranscriptRef = useRef<(text: string, final?: boolean) => void>(() => undefined)
  const onSpeechErrorRef = useRef<(code: string) => void>(() => undefined)
  const speech = useSpeechRecognition({
    onTranscriptChange: (t, final) => onTranscriptRef.current(t, final),
    onError: (c) => onSpeechErrorRef.current(c),
    onStart: () => {
      if (turnRef.current.listeningAt === null) turnRef.current.listeningAt = Date.now()
    },
    lang: 'es-CO',
    grammar,
  })
  const speechRef = useRef(speech)
  useEffect(() => {
    speechRef.current = speech
  })

  const process = useCallback(
    async (text: string, turn: VoiceTurn) => {
      setState('processing')
      setLastTranscript(text)
      const route = routeUtterance(text, handlersListRef.current, engineId)
      const followUpTurn = followUpTurnRef.current
      followUpTurnRef.current = false
      if (route.kind === 'stop') {
        abortRef.current?.abort()
        deviceSpeech.clear()
        processingRef.current = false
        endConversation()
        setState('idle')
        return
      }
      if (route.kind === 'close') {
        processingRef.current = false
        endConversation()
        return present({ tone: 'info', message: 'Con gusto.', spoken: 'Con gusto.', priority: 'answer' })
      }
      if (route.kind === 'none') {
        processingRef.current = false
        // Silence or a stray word after an answer is not a question: the conversation ends quietly.
        if (route.reason === 'empty' || (followUpTurn && text.trim().split(/\s+/).length < 2)) {
          endConversation()
          return setState('idle')
        }
        present(
          route.reason === 'offline-question'
            ? { tone: 'info', message: 'Para preguntas, cambia el reconocedor a «navegador» en este equipo.', spoken: 'Para preguntas, cambia el reconocedor en este equipo.' }
            : { tone: 'error', message: 'No entendí.', spoken: 'No entendí.' },
        )
        return continueConversation()
      }
      // After an answer, one stray word nobody on screen understands is noise, not a question for Copilot.
      if (followUpTurn && route.handler.fallback && text.trim().split(/\s+/).length < 2) {
        processingRef.current = false
        endConversation()
        return setState('idle')
      }
      const abort = new AbortController()
      abortRef.current = abort
      try {
        const reply = await route.handler.handle(text, { engine: engineId, signal: abort.signal, turn: { ...turn, followUp: followUpTurn } })
        if (abort.signal.aborted) {
          endConversation()
          return setState('idle')
        }
        if (reply) {
          present(reply)
          continueConversation()
        } else {
          endConversation()
          setState('idle')
        }
      } catch {
        if (!abort.signal.aborted) {
          present({ tone: 'error', message: 'No pude responder.', spoken: 'No pude responder.' })
          continueConversation()
        }
      } finally {
        processingRef.current = false
      }
    },
    [engineId, present, endConversation, continueConversation],
  )

  const finalize = useCallback(
    (heard: string) => {
      const t = turnRef.current
      const now = Date.now()
      const turn: VoiceTurn = {
        wake: t.wake,
        followUp: false,
        listenMs: t.listeningAt === null || !t.startedAt ? null : Math.max(0, t.listeningAt - t.startedAt),
        endpointMs: t.lastWordAt === null ? null : now - t.lastWordAt,
        lastWordAt: t.lastWordAt,
      }
      const text = stripWakePhrase(heard)
      processingRef.current = true
      speechRef.current.stop()
      if (modeRef.current === 'dictate') {
        const d = dictationRef.current
        dictationRef.current = null
        setDictating(false)
        processingRef.current = false
        setState('idle')
        d?.onDone(text)
        return
      }
      void process(text, turn)
    },
    [process],
  )

  useEffect(() => {
    onTranscriptRef.current = (text: string, final = false) => {
      // A late result while stop() is being applied is ignored: something is already running.
      if (processingRef.current) return
      const t = turnRef.current
      // The same thing again (some engines repeat it): the pause already running keeps counting.
      if (text && text === t.lastText && final === t.lastFinal && timers.current.debounce) return
      if (text !== t.lastText) t.lastWordAt = Date.now()
      t.lastText = text
      t.lastFinal = final
      setLiveTranscript(text)
      setState('listening')
      if (modeRef.current === 'dictate') dictationRef.current?.onTranscript(text)
      clearTimer('debounce')
      if (!text) return
      clearTimer('noSpeech')
      // ADR 0041 (D2): settled text closes after a short pause; provisional text waits longer.
      const dictating = modeRef.current === 'dictate'
      const delay = final ? (dictating ? DICTATION_FINAL_DELAY_MS : VOICE_FINAL_DELAY_MS) : dictating ? DICTATION_DELAY_MS : VOICE_PHRASE_DELAY_MS
      timers.current.debounce = setTimeout(() => finalize(text), delay)
    }
    onSpeechErrorRef.current = (code: string) => {
      setDictating(false)
      dictationRef.current = null
      if (code === 'not-allowed') setPaused(true)
      present({ tone: 'error', message: speechErrorMessage(code), toast: code === 'not-allowed' })
    }
  })

  const startSession = useCallback(
    async (mode: 'route' | 'dictate', handsFree: boolean, followUpTurn = false) => {
      turnRef.current = { startedAt: Date.now(), wake: handsFree && !followUpTurn, listeningAt: null, lastWordAt: null, lastText: '', lastFinal: false }
      processingRef.current = false
      clearTimer('noSpeech')
      clearTimer('debounce')
      clearTimer('reset')
      clearTimer('follow')
      followUpTurnRef.current = followUpTurn
      modeRef.current = mode
      setDictating(mode === 'dictate')
      setLiveTranscript('')
      setState('listening')
      // ADR 0041 (D3): it listens while the tone sounds, so nothing said right after it is lost.
      if (handsFree) void (followUpTurn ? playFollowUpTone() : playWakeTone())
      void speechRef.current.start()
      if (handsFree) {
        // Nobody spoke after «Oye Quanela» (or after the answer): back to waiting, quietly; the conversation ends.
        timers.current.noSpeech = setTimeout(
          () => {
            timers.current.noSpeech = undefined
            speechRef.current.stop()
            endConversation()
            setState('idle')
          },
          followUpTurn ? FOLLOW_UP_WINDOW_MS : HANDS_FREE_WINDOW_MS,
        )
      }
    },
    [endConversation],
  )
  useEffect(() => {
    startSessionRef.current = startSession
  })

  const listen = useCallback(() => {
    if (!supported) return present({ tone: 'error', message: 'Este navegador no reconoce la voz. Puedes escribir.' })
    if (engineId === 'vosk' && !handlersListRef.current.some((h) => h.grammar)) {
      return present({ tone: 'info', message: 'Para preguntas, cambia el reconocedor a «navegador» en este equipo.' })
    }
    void startSession('route', false)
  }, [supported, engineId, present, startSession])

  const dictate = useCallback(
    (d: Dictation) => {
      if (!supported || engineId === 'vosk') return present({ tone: 'info', message: 'Para dictar preguntas, usa el reconocedor «navegador» en este equipo.' })
      dictationRef.current = d
      void startSession('dictate', false)
    },
    [supported, engineId, present, startSession],
  )

  const stop = useCallback(() => {
    endConversation()
    clearTimer('debounce')
    clearTimer('noSpeech')
    speechRef.current.stop()
    abortRef.current?.abort()
    deviceSpeech.clear()
    processingRef.current = false
    dictationRef.current = null
    setDictating(false)
    setState('idle')
  }, [endConversation])

  const submitText = useCallback((text: string) => {
    modeRef.current = 'route'
    // Typed, not heard: nothing to measure.
    turnRef.current = { startedAt: 0, wake: false, listeningAt: null, lastWordAt: null, lastText: '', lastFinal: false }
    onTranscriptRef.current(text)
  }, [])

  // Hands-free: «Oye Quanela» on this device, only where it can do something, and never while hidden.
  const handsFreeAllowed = voiceUsable && isWakeWordSupported()
  const busy = state === 'listening' || state === 'processing'
  const wake = useWakeWord({
    active: handsFreeAllowed && handsFreeOn && !paused && visible && available,
    suspended: busy || conversing,
    tuning: wakeWordTuning(feature('voice_wake_word')),
    onDetect: () => {
      // ADR 0041 (D4): whoever may answer gets ready while the person is still speaking.
      if (engineId !== 'vosk') for (const h of handlersListRef.current) h.prepare?.()
      // «Oye Quanela» starts a conversation (when this device keeps listening after answering).
      if (followUpPrefRef.current) {
        conversationRef.current = { turns: 0, startedAt: Date.now() }
        setConversing(true)
      }
      void startSession('route', true)
    },
  })

  // A hidden tab never keeps the microphone open.
  useEffect(() => {
    if (!visible && conversationRef.current) stop()
  }, [visible, stop])

  // Ctrl/⌘ + Shift + J: say one phrase without «Oye Quanela».
  useEffect(() => {
    if (!available) return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault()
        listen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [available, listen])

  useEffect(() => {
    const t = timers.current
    return () => {
      for (const id of Object.values(t)) if (id) clearTimeout(id)
    }
  }, [])

  const value = useMemo<VoiceContextValue>(
    () => ({
      available,
      supported,
      engine: engineId,
      state,
      dictating,
      liveTranscript,
      lastTranscript,
      lastReply,
      handsFree: {
        allowed: handsFreeAllowed,
        on: handsFreeOn,
        setOn: setHandsFreeOn,
        paused,
        togglePause: () => setPaused((p) => !p),
        state: wake.state,
        error: wake.error,
      },
      conversation: { active: conversing, enabled: followUp, setEnabled: setFollowUp, end: stop },
      replies,
      setReplies,
      speechAllowed: voice.allowed,
      listen,
      dictate,
      stop,
      submitText,
      say: voice.say,
      registerHandler,
    }),
    [
      available, supported, engineId, state, dictating, liveTranscript, lastTranscript, lastReply, handsFreeAllowed, handsFreeOn, setHandsFreeOn,
      paused, wake.state, wake.error, conversing, followUp, setFollowUp, replies, setReplies, voice.allowed, voice.say, listen, dictate, stop, submitText, registerHandler,
    ],
  )

  return <VoiceContext value={value}>{children}</VoiceContext>
}
