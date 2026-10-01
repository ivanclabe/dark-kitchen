import { Button } from '@/shared/ui/Button'
import { Switch } from '@/shared/ui/Switch'
import { typography } from '@/shared/ui/typography'
import { useWakeWordPreference } from '@/shared/voice/wakeWord/preference'
import { playWakeTone } from '@/shared/voice/wakeWord/tone'
import type { WakeWordTuning } from '@/shared/voice/wakeWord/wakeWordStream'
import { isWakeWordSupported, useWakeWordModelStatus } from '@/shared/voice/wakeWord/wakeWordModel'
import { useWakeWord } from '@/shared/voice/wakeWord/useWakeWord'
import clsx from 'clsx'
import { Ear, Square } from 'lucide-react'
import { useRef, useState } from 'react'

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1)

/**
 * "Manos libres (Oye Quanela)" on this device (ADR 0016): off by default.
 * "Probar" listens for the phrase and shows the live probability; it never
 * opens a command.
 */
export function WakeWordPanel({ tuning }: { tuning: WakeWordTuning }) {
  const [on, setOn] = useWakeWordPreference()
  const [testing, setTesting] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [detections, setDetections] = useState(0)
  const [flash, setFlash] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const status = useWakeWordModelStatus()
  const supported = isWakeWordSupported()

  const test = useWakeWord({
    active: testing,
    tuning,
    onScore: setScore,
    onDetect: () => {
      setDetections((n) => n + 1)
      setFlash(true)
      void playWakeTone()
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(false), 1500)
    },
  })

  function toggleTest() {
    setScore(null)
    setDetections(0)
    setTesting((t) => !t)
  }

  const pct = Math.round((score ?? 0) * 100)
  const warming = testing && test.state === 'listening' && score === null

  return (
    <div className="space-y-3">
      <div className="flex max-w-md items-start justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-200">Manos libres (Oye Quanela)</p>
          <p className={typography.caption}>
            Di «Oye Quanela» y luego el comando, sin tocar la pantalla. El micrófono queda abierto en este equipo; el audio se procesa aquí y no se guarda ni se envía. En tabletas, deja la
            pantalla encendida.
          </p>
        </div>
        <Switch checked={on} onChange={setOn} label="Manos libres (Oye Quanela)" disabled={!supported} />
      </div>

      {status.state === 'downloading' && status.total > 0 && (
        <div className="max-w-md space-y-1 text-xs">
          <p className="text-neutral-300">
            Descargando «Oye Quanela»: {mb(status.loaded)} de {mb(status.total)} MB (solo la primera vez)
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
            <div className="h-full rounded-full bg-brasa-500" style={{ width: `${Math.round((status.loaded / status.total) * 100)}%` }} />
          </div>
        </div>
      )}
      {status.state === 'error' && <p className="text-xs text-red-300">No se pudo cargar «Oye Quanela»: {status.message}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={testing ? Square : Ear} onClick={toggleTest} disabled={!supported}>
          {testing ? 'Detener' : 'Probar'}
        </Button>
        <span className={clsx('text-xs', test.state === 'error' ? 'text-red-300' : testing ? 'text-brasa-300' : 'text-neutral-500')}>
          {!supported
            ? 'Este navegador no puede usar manos libres.'
            : test.state === 'error'
              ? test.error === 'not-allowed'
                ? 'Permiso de micrófono denegado.'
                : 'No se pudo iniciar la escucha.'
              : testing
                ? warming || test.state === 'loading'
                  ? 'Preparando…'
                  : 'Escuchando… di «Oye Quanela».'
                : 'No abre ningún comando.'}
        </span>
      </div>

      {testing && test.state === 'listening' && (
        <div className="max-w-md space-y-1.5 rounded-xl border border-neutral-800/60 px-3 py-2 text-xs" role="status">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Probabilidad</span>
            <span className={clsx('tabular-nums', flash ? 'font-semibold text-emerald-300' : 'text-neutral-300')}>{flash ? '¡Detectado!' : `${pct} %`}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
            <div className={clsx('h-full rounded-full transition-[width] duration-75', flash ? 'bg-emerald-400' : 'bg-brasa-500')} style={{ width: `${flash ? 100 : pct}%` }} />
            <div className="absolute top-0 h-full w-px bg-neutral-300" style={{ left: `${Math.round(tuning.threshold * 100)}%` }} />
          </div>
          <p className="text-neutral-500">
            Detecciones: <span className="tabular-nums text-neutral-300">{detections}</span> · la línea marca el umbral ({Math.round(tuning.threshold * 100)} %)
          </p>
        </div>
      )}
    </div>
  )
}
