import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { useVoiceCommandEngine } from './useVoiceCommandEngine'
import { VoiceMicButton } from './VoiceMicButton'

type VoiceEngine = ReturnType<typeof useVoiceCommandEngine>

/**
 * Control de voz compacto: un botón de micrófono y, solo mientras hay algo
 * que decir (escuchando, resultado, prueba de texto), una burbuja flotante
 * debajo — no empuja el resto del header. El motor vive en la página (así el
 * menú ⋯ controla la respuesta hablada y la prueba de texto). Se oculta si
 * el navegador no soporta reconocimiento de voz; el tablero funciona igual.
 */
export function VoiceCommandBar({ engine, enabled, testOpen, onCloseTest }: { engine: VoiceEngine; enabled: boolean; testOpen: boolean; onCloseTest: () => void }) {
  const [value, setValue] = useState('')

  if (!engine.supported) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = value.trim()
    if (!text) return
    engine.simulateTranscript(text)
    setValue('')
  }

  const showFeedback = enabled && engine.phase !== 'idle' && (engine.phase === 'listening' || engine.lastTranscript || engine.lastMessage)
  const showBubble = enabled && (showFeedback || testOpen)

  return (
    <div className="relative">
      <VoiceMicButton phase={engine.phase} onStart={engine.start} disabled={!enabled} />

      {showBubble && (
        <div className="shadow-float absolute top-full right-0 z-30 mt-2 w-72 space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs">
          {showFeedback && (
            <div role="status" className="space-y-0.5">
              {engine.phase === 'listening' ? (
                <p className="text-neutral-300">{engine.liveTranscript ? `🎤 "${engine.liveTranscript}"` : 'Escuchando…'}</p>
              ) : (
                <>
                  {engine.lastTranscript && <p className="text-neutral-500">🎤 "{engine.lastTranscript}"</p>}
                  {engine.lastMessage && <p className={clsx(engine.phase === 'error' ? 'text-red-400' : 'text-emerald-400')}>{engine.lastMessage}</p>}
                </>
              )}
            </div>
          )}
          {testOpen && (
            <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='"pedido 2040 listo"'
                aria-label="Probar comando de texto"
                autoFocus
                className="!mt-0 h-8 flex-1 !py-1 text-xs"
              />
              <Button type="submit" size="sm" variant="secondary">
                Enviar
              </Button>
              <button type="button" onClick={onCloseTest} aria-label="Cerrar prueba de texto" className="rounded-full p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200">
                <X size={14} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
