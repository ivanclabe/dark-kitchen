import { useEffect, useRef, useState } from 'react'

const SPEECH_RECOGNITION_CTOR =
  typeof window !== 'undefined' ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined

export const isSpeechRecognitionSupported = !!SPEECH_RECOGNITION_CTOR

/**
 * Envuelve el Web Speech API (SpeechRecognition) del navegador. No sabe
 * nada de pedidos ni comandos — solo entrega transcripts de texto. Si el
 * navegador no lo soporta (Firefox, la mayoría de navegadores embebidos de
 * Smart TV), `supported` queda en false y start()/stop() no hacen nada; el
 * resto del KDS sigue funcionando igual.
 *
 * continuous+interimResults: la sesión NO se corta en la primera pausa
 * natural del habla — sigue escuchando y entrega el transcript acumulado
 * completo (parcial + final) en cada actualización vía onTranscriptChange.
 * Decidir CUÁNDO ese transcript ya está "completo" (ventana de silencio)
 * es responsabilidad de quien use este hook, no de este wrapper.
 */
export function useSpeechRecognition({
  onTranscriptChange,
  onError,
  lang = 'es-CO',
  maxDurationMs = 20_000,
}: {
  onTranscriptChange: (transcript: string) => void
  onError?: (code: string) => void
  lang?: string
  /** Corta la sesión sola si nunca hay silencio — evita quedar escuchando indefinidamente. */
  maxDurationMs?: number
}) {
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onTranscriptChangeRef = useRef(onTranscriptChange)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onTranscriptChangeRef.current = onTranscriptChange
    onErrorRef.current = onError
  })

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current)
    }
  }, [])

  function start() {
    if (!SPEECH_RECOGNITION_CTOR || recognitionRef.current) return
    setError(null)
    const recognition = new SPEECH_RECOGNITION_CTOR()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onstart = () => setListening(true)
    recognition.onresult = (e) => {
      let fullTranscript = ''
      for (let i = 0; i < e.results.length; i++) {
        fullTranscript += e.results[i]?.[0]?.transcript ?? ''
      }
      onTranscriptChangeRef.current(fullTranscript.trim())
    }
    recognition.onerror = (e) => {
      setError(e.error)
      setListening(false)
      onErrorRef.current?.(e.error)
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current)
        maxDurationTimerRef.current = null
      }
    }
    recognition.start()
    recognitionRef.current = recognition
    maxDurationTimerRef.current = setTimeout(() => recognition.stop(), maxDurationMs)
  }

  function stop() {
    recognitionRef.current?.stop()
  }

  return { supported: isSpeechRecognitionSupported, listening, error, start, stop }
}
