import { Tooltip } from '@/shared/ui/Tooltip'
import { Button, IconButton } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { MicOff, Volume2, VolumeX } from 'lucide-react'
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
 * `enabled=false` (modo histórico, día distinto de hoy) apaga el motor de
 * voz por completo — ni siquiera se le pasan los tickets — y el botón queda
 * visiblemente inactivo en vez de desaparecer, para que quede claro que la
 * función existe pero no aplica a un día pasado.
 *
 * Incluye un campo opcional "probar comando de texto" que alimenta el mismo
 * pipeline (parseVoiceCommand → validación → mutación) sin pasar por el
 * micrófono — útil para probar sin hablar y como registro de qué comandos
 * se probaron.
 */
export function VoiceCommandBar({ tickets, enabled = true }: { tickets: KitchenTicket[] | undefined; enabled?: boolean }) {
  const engine = useVoiceCommandEngine(enabled ? tickets : undefined)
  const [simulateOpen, setSimulateOpen] = useState(false)
  const [simulateValue, setSimulateValue] = useState('')

  if (!engine.supported) return null

  if (!enabled) {
    return (
      <Tooltip label="Disponible solo para pedidos de hoy" side="top">
        <Button variant="secondary" icon={MicOff} disabled aria-label="Control por voz no disponible en días anteriores">
          Voz no disponible
        </Button>
      </Tooltip>
    )
  }

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
        <IconButton
          icon={engine.ttsEnabled ? Volume2 : VolumeX}
          aria-label={engine.ttsEnabled ? 'Silenciar respuestas por voz' : 'Activar respuestas por voz'}
          aria-pressed={engine.ttsEnabled}
          active={engine.ttsEnabled}
          onClick={engine.toggleTts}
        />
      </div>

      {engine.phase === 'listening' && (
        <p role="status" className="max-w-xs text-right text-xs text-neutral-400">
          {engine.liveTranscript ? `🎤 "${engine.liveTranscript}"` : 'Escuchando…'}
        </p>
      )}

      {engine.phase !== 'listening' && (engine.lastTranscript || engine.lastMessage) && (
        <div role="status" className="max-w-xs text-right text-xs">
          {engine.lastTranscript && <p className="text-neutral-500">🎤 "{engine.lastTranscript}"</p>}
          {engine.lastMessage && (
            <p className={engine.phase === 'error' ? 'text-red-400' : 'text-emerald-400'}>{engine.lastMessage}</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setSimulateOpen((open) => !open)}
        aria-expanded={simulateOpen}
        className="text-[11px] text-neutral-600 hover:text-neutral-400 hover:underline"
      >
        {simulateOpen ? 'Ocultar prueba de texto' : 'Probar comando de texto'}
      </button>
      {simulateOpen && (
        <form onSubmit={handleSimulateSubmit} className="flex items-center gap-1.5">
          <Input
            value={simulateValue}
            onChange={(e) => setSimulateValue(e.target.value)}
            placeholder='"pedido 2040 listo"'
            aria-label="Comando de texto"
            className="!mt-0 h-8 w-48 !py-1 text-xs"
          />
          <Button type="submit" size="sm" variant="secondary">
            Enviar
          </Button>
        </form>
      )}
    </div>
  )
}
