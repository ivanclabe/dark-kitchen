import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useToast } from '@/shared/ui/Toast'
import { useQuanelaVoice } from '@/shared/voice/hooks'
import { useRecognizerPreference } from '@/shared/voice/recognition/preference'
import { engineFor } from '@/shared/voice/recognition/engines'
import { useSpeechRecognition } from '@/shared/voice/recognition/useSpeechRecognition'
import { deviceSpeech } from '@/shared/voice/speechQueue'
import { useWakeWordPreference } from '@/shared/voice/wakeWord/preference'
import { playWakeTone } from '@/shared/voice/wakeWord/tone'
import { wakeWordTuning } from '@/shared/voice/wakeWord/tuning'
import { useWakeWord } from '@/shared/voice/wakeWord/useWakeWord'
import { isWakeWordSupported } from '@/shared/voice/wakeWord/wakeWordModel'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVoiceFlag } from './prefs'
import { routeUtterance, stripWakePhrase } from './router'
import type { VoiceHandler, VoiceReply, VoiceState } from './types'
import { DICTATION_DELAY_MS, HANDS_FREE_WINDOW_MS, VOICE_PHRASE_DELAY_MS, VoiceContext, type Dictation, type VoiceContextValue } from './voiceContext'

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
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const { canUseFeature, feature } = useActiveKitchen()
  const { show } = useToast()
  const voice = useQuanelaVoice()
  const [engineId] = useRecognizerPreference()
  const supported = engineFor(engineId).supported()
  const [handsFreeOn, setHandsFreeOn] = useWakeWordPreference()
  const [replies, setReplies] = useVoiceFlag('replies', true)
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

  const modeRef = useRef<'route' | 'dictate'>('route')
  const dictationRef = useRef<Dictation | null>(null)
  const processingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const timers = useRef<{ debounce?: ReturnType<typeof setTimeout>; noSpeech?: ReturnType<typeof setTimeout>; reset?: ReturnType<typeof setTimeout> }>({})
  const handlersListRef = useRef(handlers)
  const repliesRef = useRef(replies)
  const sayRef = useRef(voice.say)
  useEffect(() => {
    handlersListRef.current = handlers
    repliesRef.current = replies
    sayRef.current = voice.say
  })

  // The offline recognizer only knows a handler's vocabulary (the kitchen's).
  const grammar = engineId === 'vosk' ? handlers.find((h) => h.grammar)?.grammar : undefined
  const voiceUsable = canUseFeature('voice_wake_word')
  const available = supported && handlers.length > 0 && (voiceUsable || handlers.some((h) => h.grammar))

  const clearTimer = (key: 'debounce' | 'noSpeech' | 'reset') => {
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

  // Defined below; the recognizer calls them through refs (it outlives renders).
  const onTranscriptRef = useRef<(text: string) => void>(() => undefined)
  const onSpeechErrorRef = useRef<(code: string) => void>(() => undefined)
  const speech = useSpeechRecognition({
    onTranscriptChange: (t) => onTranscriptRef.current(t),
    onError: (c) => onSpeechErrorRef.current(c),
    lang: 'es-CO',
    grammar,
  })
  const speechRef = useRef(speech)
  useEffect(() => {
    speechRef.current = speech
  })

  const process = useCallback(
    async (text: string) => {
      setState('processing')
      setLastTranscript(text)
      const route = routeUtterance(text, handlersListRef.current, engineId)
      if (route.kind === 'stop') {
        abortRef.current?.abort()
        deviceSpeech.clear()
        processingRef.current = false
        setState('idle')
        return
      }
      if (route.kind === 'none') {
        processingRef.current = false
        if (route.reason === 'empty') return setState('idle')
        return present(
          route.reason === 'offline-question'
            ? { tone: 'info', message: 'Para preguntas, cambia el reconocedor a «navegador» en este equipo.', spoken: 'Para preguntas, cambia el reconocedor en este equipo.' }
            : { tone: 'error', message: 'No entendí.', spoken: 'No entendí.' },
        )
      }
      const abort = new AbortController()
      abortRef.current = abort
      try {
        const reply = await route.handler.handle(text, { engine: engineId, signal: abort.signal })
        if (abort.signal.aborted) return setState('idle')
        if (reply) present(reply)
        else setState('idle')
      } catch {
        if (!abort.signal.aborted) present({ tone: 'error', message: 'No pude responder.', spoken: 'No pude responder.' })
      } finally {
        processingRef.current = false
      }
    },
    [engineId, present],
  )

  const finalize = useCallback(
    (heard: string) => {
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
      void process(text)
    },
    [process],
  )

  useEffect(() => {
    onTranscriptRef.current = (text: string) => {
      // A late result while stop() is being applied is ignored: something is already running.
      if (processingRef.current) return
      setLiveTranscript(text)
      setState('listening')
      if (modeRef.current === 'dictate') dictationRef.current?.onTranscript(text)
      clearTimer('debounce')
      if (!text) return
      clearTimer('noSpeech')
      timers.current.debounce = setTimeout(() => finalize(text), modeRef.current === 'dictate' ? DICTATION_DELAY_MS : VOICE_PHRASE_DELAY_MS)
    }
    onSpeechErrorRef.current = (code: string) => {
      setDictating(false)
      dictationRef.current = null
      if (code === 'not-allowed') setPaused(true)
      present({ tone: 'error', message: speechErrorMessage(code), toast: code === 'not-allowed' })
    }
  })

  const startSession = useCallback(
    async (mode: 'route' | 'dictate', handsFree: boolean) => {
      processingRef.current = false
      clearTimer('noSpeech')
      clearTimer('debounce')
      clearTimer('reset')
      modeRef.current = mode
      setDictating(mode === 'dictate')
      setLiveTranscript('')
      setState('listening')
      if (handsFree) await playWakeTone()
      void speechRef.current.start()
      if (handsFree) {
        // Nobody spoke after «Oye Quanela»: back to waiting, quietly.
        timers.current.noSpeech = setTimeout(() => {
          timers.current.noSpeech = undefined
          speechRef.current.stop()
          setState('idle')
        }, HANDS_FREE_WINDOW_MS)
      }
    },
    [],
  )

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
    clearTimer('debounce')
    clearTimer('noSpeech')
    speechRef.current.stop()
    abortRef.current?.abort()
    deviceSpeech.clear()
    processingRef.current = false
    dictationRef.current = null
    setDictating(false)
    setState('idle')
  }, [])

  const submitText = useCallback((text: string) => {
    modeRef.current = 'route'
    onTranscriptRef.current(text)
  }, [])

  // Hands-free: «Oye Quanela» on this device, only where it can do something, and never while hidden.
  const handsFreeAllowed = voiceUsable && isWakeWordSupported()
  const busy = state === 'listening' || state === 'processing'
  const wake = useWakeWord({
    active: handsFreeAllowed && handsFreeOn && !paused && visible && available,
    suspended: busy,
    tuning: wakeWordTuning(feature('voice_wake_word')),
    onDetect: () => void startSession('route', true),
  })

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
      paused, wake.state, wake.error, replies, setReplies, voice.allowed, voice.say, listen, dictate, stop, submitText, registerHandler,
    ],
  )

  return <VoiceContext value={value}>{children}</VoiceContext>
}
