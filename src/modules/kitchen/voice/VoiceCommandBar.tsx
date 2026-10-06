import { VoiceMicButton } from '@/modules/voice/components/VoiceMicButton'
import { useVoice } from '@/modules/voice/voiceContext'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/FormField'
import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

/**
 * Control de voz compacto de Cocina: un botón de micrófono y la prueba de
 * texto en una burbuja flotante. El micrófono es el de «Oye Quanela» (ADR
 * 0033): lo que se dice aquí llega primero a los comandos de Cocina, y lo que
 * se oyó y la respuesta se ven bajo el indicador de la barra superior. Se
 * oculta si el navegador no reconoce la voz; el tablero funciona igual.
 */
export function VoiceCommandBar({ testOpen, onCloseTest }: { testOpen: boolean; onCloseTest: () => void }) {
  const voice = useVoice()
  const [value, setValue] = useState('')

  if (!voice.supported) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = value.trim()
    if (!text) return
    voice.submitText(text)
    setValue('')
  }

  const routed = !voice.dictating

  return (
    <div className="relative">
      <VoiceMicButton phase={routed ? voice.state : 'idle'} onStart={voice.listen} />

      {testOpen && (
        <div className="shadow-float absolute top-full right-0 z-30 mt-2 w-72 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs">
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
        </div>
      )}
    </div>
  )
}
