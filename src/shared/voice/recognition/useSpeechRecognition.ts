import { engineFor, type RecognitionSession } from '@/shared/voice/recognition/engines'
import { useRecognizerPreference } from '@/shared/voice/recognition/preference'
import { loadVoskModel } from '@/shared/voice/recognition/voskModel'
import { useEffect, useRef, useState } from 'react'

/**
 * Speech recognition for the kitchen, with the engine chosen on this device
 * (ADR 0015): the browser's (Web Speech API) or offline Vosk. It knows
 * nothing about orders or commands — it only delivers transcripts. If the
 * engine is not available (e.g. Firefox with the browser engine),
 * `supported` is false and start()/stop() do nothing; the rest of the KDS
 * works the same.
 *
 * The session does not end at the first natural pause: it keeps listening
 * and delivers the full accumulated transcript (final + partial) on every
 * update through onTranscriptChange. Deciding WHEN that transcript is
 * "complete" (silence window) belongs to the caller.
 */
export function useSpeechRecognition({
  onTranscriptChange,
  onError,
  onStart,
  lang = 'es-CO',
  grammar,
  maxDurationMs = 20_000,
}: {
  onTranscriptChange: (transcript: string, final: boolean) => void
  onError?: (code: string) => void
  /** The engine is actually listening (ADR 0041: measured from «Oye Quanela»). */
  onStart?: () => void
  lang?: string
  /** Allowed vocabulary for engines that support it (Vosk). */
  grammar?: string
  /** Stops the session if there is never silence, so it never listens forever. */
  maxDurationMs?: number
}) {
  const [engineId] = useRecognizerPreference()
  const engine = engineFor(engineId)
  const sessionRef = useRef<RecognitionSession | null>(null)
  const startingRef = useRef(false)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onTranscriptChangeRef = useRef(onTranscriptChange)
  const onErrorRef = useRef(onError)
  const onStartRef = useRef(onStart)

  useEffect(() => {
    onTranscriptChangeRef.current = onTranscriptChange
    onErrorRef.current = onError
    onStartRef.current = onStart
  })

  // Offline engine: load the model in the background so the microphone answers at once.
  useEffect(() => {
    if (engineId === 'vosk' && engine.supported()) void loadVoskModel().catch(() => undefined)
  }, [engineId, engine])

  useEffect(() => {
    return () => {
      sessionRef.current?.stop()
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current)
    }
  }, [])

  function fail(code: string) {
    setError(code)
    setListening(false)
    onErrorRef.current?.(code)
  }

  async function start() {
    if (!engine.supported() || sessionRef.current || startingRef.current) return
    startingRef.current = true
    setError(null)
    try {
      const session = await engine.start({
        lang,
        grammar,
        onTranscript: (text, final) => onTranscriptChangeRef.current(text, final),
        onStart: () => {
          setListening(true)
          onStartRef.current?.()
        },
        onEnd: () => {
          setListening(false)
          sessionRef.current = null
          if (maxDurationTimerRef.current) {
            clearTimeout(maxDurationTimerRef.current)
            maxDurationTimerRef.current = null
          }
        },
        onError: fail,
      })
      sessionRef.current = session
      maxDurationTimerRef.current = setTimeout(() => session.stop(), maxDurationMs)
    } catch (err) {
      fail(err instanceof Error && err.message === 'not-allowed' ? 'not-allowed' : 'engine-error')
    } finally {
      startingRef.current = false
    }
  }

  function stop() {
    sessionRef.current?.stop()
  }

  return { supported: engine.supported(), engine: engine.id, listening, error, start, stop }
}
