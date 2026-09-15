import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useEffect, useRef, useState } from 'react'
import { useAdvanceTicketItems, useSetTicketPriority } from '../hooks/useKitchen'
import type { KitchenTicket } from '../types'
import { parseVoiceCommand, type VoiceAction } from './commandParser'
import { speak } from './speak'
import { useSpeechRecognition } from './speechRecognition'

export type VoicePhase = 'idle' | 'listening' | 'processing' | 'success' | 'error'

const TTS_PREF_KEY = 'dk-kitchen-voice-tts'
const RESULT_DISPLAY_MS = 4000

/**
 * Ventana de silencio antes de procesar un comando de voz. Mientras el
 * transcript siga cambiando ("Pedido..." → "Pedido 2040..." → "Pedido 2040
 * en preparación") no se ejecuta nada — solo cuando pasan
 * VOICE_COMMAND_DELAY_MS sin cambios se toma el transcript acumulado como
 * la intención completa del usuario y se procesa.
 */
export const VOICE_COMMAND_DELAY_MS = 1800

const ACTION_FEEDBACK: Record<VoiceAction, string> = {
  CONFIRM: 'confirmado',
  START_PREPARATION: 'en preparación',
  MARK_READY: 'listo',
  SET_PRIORITY: 'marcado como prioritario',
  UNSET_PRIORITY: 'ya no es prioritario',
}

function readTtsPref(): boolean {
  try {
    return localStorage.getItem(TTS_PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Orquesta: transcript acumulado de voz (buffer + debounce) →
 * parseVoiceCommand (puro) → busca el ticket por orderNumber en la cola ya
 * cargada → valida contra su estado actual → ejecuta las MISMAS mutaciones
 * que usan los botones (useAdvanceTicketItems, useSetTicketPriority) →
 * feedback visual (toast) + auditivo opcional (TTS). No llama Supabase
 * directamente en ningún punto.
 */
export function useVoiceCommandEngine(tickets: KitchenTicket[] | undefined) {
  const ticketsRef = useRef(tickets)
  useEffect(() => {
    ticketsRef.current = tickets
  })

  const { advanceTicketItems } = useAdvanceTicketItems()
  const setPriority = useSetTicketPriority()
  const { show } = useToast()

  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [lastTranscript, setLastTranscript] = useState('')
  const [lastMessage, setLastMessage] = useState('')
  const [ttsEnabled, setTtsEnabled] = useState(readTtsPref)

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Se pone en true apenas el debounce dispara (antes incluso de validar) y
  // se usa para: (a) ignorar cualquier transcript tardío que el navegador
  // siga entregando mientras recognition.stop() termina de aplicarse, (b)
  // evitar que el mismo comando se procese dos veces.
  const isProcessingRef = useRef(false)

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setPhase('idle'), RESULT_DISPLAY_MS)
  }

  function announce(tone: 'success' | 'error', message: string) {
    setLastMessage(message)
    setPhase(tone)
    show(tone === 'success' ? `✓ ${message}` : message, tone)
    if (ttsEnabled) speak(message)
    scheduleReset()
  }

  async function processTranscript(transcript: string) {
    isProcessingRef.current = true
    speech.stop()
    setPhase('processing')
    setLastTranscript(transcript)

    const parsed = parseVoiceCommand(transcript)

    if (parsed.confidence !== 'high' || !parsed.orderCode || !parsed.action) {
      announce('error', 'No entendí el comando.')
      isProcessingRef.current = false
      return
    }

    const ticket = ticketsRef.current?.find((t) => t.orderNumber === Number(parsed.orderCode))
    if (!ticket) {
      announce('error', `El pedido ${parsed.orderCode} no existe.`)
      isProcessingRef.current = false
      return
    }

    try {
      switch (parsed.action) {
        case 'CONFIRM':
          throw new Error(`El pedido ${parsed.orderCode} ya está confirmado.`)
        case 'START_PREPARATION': {
          const hasPending = ticket.items.some((item) => item.kitchenStatus === 'PENDIENTE')
          if (!hasPending) throw new Error(`El pedido ${parsed.orderCode} ya está en preparación.`)
          await advanceTicketItems(ticket.items, 'EN_PREPARACION')
          break
        }
        case 'MARK_READY': {
          const hasPending = ticket.items.some((item) => item.kitchenStatus !== 'LISTO')
          if (!hasPending) throw new Error(`El pedido ${parsed.orderCode} ya está listo.`)
          await advanceTicketItems(ticket.items, 'LISTO')
          break
        }
        case 'SET_PRIORITY':
          await setPriority.mutateAsync({ orderId: ticket.orderId, priority: 1 })
          break
        case 'UNSET_PRIORITY':
          await setPriority.mutateAsync({ orderId: ticket.orderId, priority: 0 })
          break
      }
      announce('success', `Pedido ${parsed.orderCode} ${ACTION_FEEDBACK[parsed.action]}.`)
    } catch (err) {
      announce('error', getErrorMessage(err, `No se pudo actualizar el pedido ${parsed.orderCode}.`))
    } finally {
      isProcessingRef.current = false
    }
  }

  function handleTranscriptChange(transcript: string) {
    // El navegador puede seguir entregando un último resultado mientras
    // stop() termina de aplicarse — se ignora, ya hay un comando en curso.
    if (isProcessingRef.current) return

    setLiveTranscript(transcript)
    setPhase('listening')

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (transcript.length === 0) return

    debounceTimer.current = setTimeout(() => {
      void processTranscript(transcript)
    }, VOICE_COMMAND_DELAY_MS)
  }

  const speech = useSpeechRecognition({
    onTranscriptChange: handleTranscriptChange,
    onError: (code) => announce('error', speechErrorMessage(code)),
    lang: 'es-CO',
  })

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  function start() {
    isProcessingRef.current = false
    setLiveTranscript('')
    setPhase('listening')
    speech.start()
  }

  function toggleTts() {
    setTtsEnabled((enabled) => {
      const next = !enabled
      try {
        localStorage.setItem(TTS_PREF_KEY, next ? 'on' : 'off')
      } catch {
        // localStorage puede no estar disponible (modo privado) — no crítico.
      }
      return next
    })
  }

  return {
    supported: speech.supported,
    phase,
    liveTranscript,
    lastTranscript,
    lastMessage,
    ttsEnabled,
    toggleTts,
    start,
    stop: speech.stop,
    /**
     * Alimenta el pipeline con un transcript sin pasar por el micrófono
     * real — usado por el input de "simular comando" para pruebas. Pasa
     * por el MISMO buffer/debounce que la voz real (handleTranscriptChange),
     * no directo a processTranscript: así el campo de texto también sirve
     * para probar que enviar fragmentos crecientes ("Pedido" → "Pedido
     * 2040" → "Pedido 2040 listo") en menos de VOICE_COMMAND_DELAY_MS entre
     * sí NO ejecuta nada hasta el último, en vez de solo probar el comando
     * final de forma aislada.
     */
    simulateTranscript: handleTranscriptChange,
  }
}

function speechErrorMessage(code: string): string {
  switch (code) {
    case 'no-speech':
      return 'No escuché nada.'
    case 'audio-capture':
      return 'No hay micrófono disponible.'
    case 'not-allowed':
      return 'Permiso de micrófono denegado.'
    default:
      return 'Error de reconocimiento de voz.'
  }
}
