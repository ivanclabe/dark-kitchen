import { Button } from '@/shared/ui/Button'
import { Select } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { engineFor, type RecognitionSession } from '@/shared/voice/recognition/engines'
import { useRecognizerPreference, type RecognizerId } from '@/shared/voice/recognition/preference'
import { isVoskSupported, loadVoskModel, useVoskModelStatus } from '@/shared/voice/recognition/voskModel'
import clsx from 'clsx'
import { Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { parseVoiceCommand, type VoiceAction } from './commandParser'
import { commandGrammar } from './commandGrammar'
import { spokenNumbersToDigits } from './spokenNumbers'

const ACTION_LABEL: Record<VoiceAction, string> = {
  CONFIRM: 'confirmar',
  START_PREPARATION: 'pasar a preparación',
  MARK_READY: 'marcar listo',
  CANCEL: 'cancelar',
  SET_PRIORITY: 'marcar prioritario',
  UNSET_PRIORITY: 'quitar prioridad',
}

const mb = (bytes: number) => Math.round(bytes / 1_048_576)

/**
 * "Command recognition" on this device (ADR 0015): browser engine or
 * offline Vosk (beta). "Probar" listens once and shows what was understood
 * and which command it would be — it never touches an order.
 */
export function CommandRecognitionPanel() {
  const [engineId, setEngineId] = useRecognizerPreference()
  const status = useVoskModelStatus()
  const [testing, setTesting] = useState(false)
  const [heard, setHeard] = useState('')
  const [testError, setTestError] = useState<string | null>(null)
  const sessionRef = useRef<RecognitionSession | null>(null)
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const engine = engineFor(engineId)

  useEffect(
    () => () => {
      sessionRef.current?.stop()
      if (silenceRef.current) clearTimeout(silenceRef.current)
    },
    [],
  )

  function choose(id: RecognizerId) {
    setEngineId(id)
    setHeard('')
    setTestError(null)
    if (id === 'vosk' && isVoskSupported()) void loadVoskModel().catch(() => undefined)
  }

  function stopTest() {
    if (silenceRef.current) clearTimeout(silenceRef.current)
    sessionRef.current?.stop()
    sessionRef.current = null
    setTesting(false)
  }

  async function test() {
    setHeard('')
    setTestError(null)
    setTesting(true)
    try {
      sessionRef.current = await engine.start({
        lang: 'es-CO',
        grammar: commandGrammar(),
        onTranscript: (text) => {
          setHeard(text)
          // Same silence window as the kitchen: 1.8 s without changes ends the test.
          if (silenceRef.current) clearTimeout(silenceRef.current)
          silenceRef.current = setTimeout(stopTest, 1800)
        },
        onStart: () => {
          silenceRef.current = setTimeout(stopTest, 8000)
        },
        onEnd: () => setTesting(false),
        onError: (code) => {
          setTestError(code === 'not-allowed' ? 'Permiso de micrófono denegado.' : 'No se pudo escuchar.')
          setTesting(false)
        },
      })
    } catch (err) {
      setTestError(err instanceof Error && err.message === 'not-allowed' ? 'Permiso de micrófono denegado.' : 'No se pudo iniciar el reconocimiento.')
      setTesting(false)
    }
  }

  const parsed = heard ? parseVoiceCommand(spokenNumbersToDigits(heard)) : null
  const voskBusy = engineId === 'vosk' && (status.state === 'downloading' || status.state === 'loading')

  return (
    <div className="space-y-3">
      <div className="max-w-md">
        <label htmlFor="recognizer" className="text-xs text-neutral-400">
          Reconocimiento de comandos
        </label>
        <Select id="recognizer" value={engineId} onChange={(e) => choose(e.target.value as RecognizerId)} className="!mt-1">
          <option value="browser">Navegador (necesita internet)</option>
          <option value="vosk" disabled={!isVoskSupported()}>
            Sin internet (Vosk, beta)
          </option>
        </Select>
        <p className={typography.caption}>
          {engineId === 'browser'
            ? 'Usa el reconocimiento del navegador. En Chrome el audio se procesa en servidores de Google.'
            : 'Reconoce los comandos en este equipo, sin internet y sin enviar el audio. Solo entiende números de pedido y acciones; cancelar se hace desde la pantalla.'}
        </p>
      </div>

      {engineId === 'vosk' && (
        <div className="text-xs">
          {status.state === 'downloading' && (
            <div className="max-w-md space-y-1">
              <p className="text-neutral-300">
                Descargando modelo de voz: {mb(status.loaded)} de {mb(status.total)} MB (solo la primera vez)
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
                <div className="h-full rounded-full bg-brasa-500" style={{ width: `${Math.round((status.loaded / status.total) * 100)}%` }} />
              </div>
            </div>
          )}
          {status.state === 'loading' && <p className="text-neutral-300">Preparando el modelo de voz…</p>}
          {status.state === 'ready' && <p className="text-emerald-300">Modelo de voz listo en este equipo.</p>}
          {status.state === 'error' && (
            <p className="text-red-300">
              No se pudo cargar el modelo de voz: {status.message}{' '}
              <button type="button" className="underline" onClick={() => void loadVoskModel().catch(() => undefined)}>
                Reintentar
              </button>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {testing ? (
          <Button size="sm" variant="secondary" icon={Square} onClick={stopTest}>
            Detener
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon={Mic} onClick={() => void test()} disabled={!engine.supported() || voskBusy}>
            Probar
          </Button>
        )}
        <span className={clsx('text-xs', testing ? 'text-brasa-300' : 'text-neutral-500')}>
          {testing ? 'Escuchando… di por ejemplo «pedido dos mil cuarenta listo».' : !engine.supported() ? 'Este navegador no puede usar este reconocimiento.' : 'No cambia ningún pedido.'}
        </span>
      </div>
      {testError && <p className="text-xs text-red-300">{testError}</p>}
      {heard && (
        <dl className="grid max-w-md gap-1 rounded-xl border border-neutral-800/60 px-3 py-2 text-xs">
          <div className="flex gap-2">
            <dt className="text-neutral-500">Entendió:</dt>
            <dd className="text-neutral-200">«{heard}»</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-neutral-500">Comando:</dt>
            <dd className={parsed?.confidence === 'high' ? 'text-emerald-300' : 'text-amber-300'}>
              {parsed?.confidence === 'high' && parsed.action && parsed.orderCode
                ? `Pedido ${parsed.orderCode} → ${ACTION_LABEL[parsed.action]}${parsed.action === 'CANCEL' && engineId === 'vosk' ? ' (sin internet se cancela desde la pantalla)' : ''}`
                : 'Ninguno (falta el número de pedido o la acción)'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}
