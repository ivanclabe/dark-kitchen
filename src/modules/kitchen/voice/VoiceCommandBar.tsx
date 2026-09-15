import { inputClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { Volume2, VolumeX } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { KitchenTicket } from '../types'
import { useVoiceCommandEngine } from './useVoiceCommandEngine'
import { VoiceMicButton } from './VoiceMicButton'

/**
 * Control de voz de Cocina: botón de micrófono + estado en vivo + toggle de
 * respuesta hablada. Se oculta por completo si el navegador no soporta
 * reconocimiento de voz (Firefox, la mayoría de Smart TV) — el resto del
 * KDS (botones táctiles) sigue funcionando exactamente igual sin esto.
 *
 * Incluye un campo opcional "probar comando de texto" que alimenta el mismo
 * pipeline (parseVoiceCommand → validación → mutación) sin pasar por el
 * micrófono — útil para probar sin hablar y como registro de qué comandos
 * se probaron.
 */
export function VoiceCommandBar({ tickets }: { tickets: KitchenTicket[] | undefined }) {
  const engine = useVoiceCommandEngine(tickets)
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [simulateValue, setSimulateValue] = useState('')

  if (!engine.supported) return null

  function handleSimulateSubmit(e: FormEvent) {
    e.preventDefault()
    const value = simulateValue.trim()
    if (!value) return
    engine.simulateTranscript(value)
    setSimulateValue('')
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <VoiceMicButton phase={engine.phase} onStart={engine.start} />
        <button
          onClick={engine.toggleTts}
          title={engine.ttsEnabled ? 'Silenciar respuestas por voz' : 'Activar respuestas por voz'}
          className="rounded-md border border-neutral-700 p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          {engine.ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      {(engine.lastTranscript || engine.lastMessage) && (
        <div className="max-w-xs text-right text-xs">
          {engine.lastTranscript && <p className="text-neutral-500">🎤 "{engine.lastTranscript}"</p>}
          {engine.lastMessage && (
            <p className={engine.phase === 'error' ? 'text-red-400' : 'text-emerald-400'}>{engine.lastMessage}</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setSimulateOpen((open) => !open)}
        className="text-[11px] text-neutral-600 hover:text-neutral-400 hover:underline"
      >
        {simulateOpen ? 'Ocultar prueba de texto' : 'Probar comando de texto'}
      </button>
      {simulateOpen && (
        <form onSubmit={handleSimulateSubmit} className="flex gap-1.5">
          <input
            value={simulateValue}
            onChange={(e) => setSimulateValue(e.target.value)}
            placeholder='"pedido 2040 listo"'
            className={`${inputClass} !mt-0 w-48 !py-1.5 text-xs`}
          />
          <button type="submit" className={`${secondaryButtonClass} !px-2.5 !py-1.5 text-xs`}>
            Enviar
          </button>
        </form>
      )}
    </div>
  )
}
