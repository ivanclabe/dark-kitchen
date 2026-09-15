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
 */
export function useSpeechRecognition({
  onResult,
  onError,
  lang = 'es-CO',
}: {
  onResult: (transcript: string) => void
  onError?: (code: string) => void
  lang?: string
}) {
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onResultRef.current = onResult
    onErrorRef.current = onError
  })

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  function start() {
    if (!SPEECH_RECOGNITION_CTOR || recognitionRef.current) return
    setError(null)
    const recognition = new SPEECH_RECOGNITION_CTOR()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setListening(true)
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      onResultRef.current(transcript)
    }
    recognition.onerror = (e) => {
      setError(e.error)
      setListening(false)
      onErrorRef.current?.(e.error)
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognition.start()
    recognitionRef.current = recognition
  }

  function stop() {
    recognitionRef.current?.stop()
  }

  return { supported: isSpeechRecognitionSupported, listening, error, start, stop }
}
