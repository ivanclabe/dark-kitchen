import { Tooltip } from '@/shared/ui/Tooltip'
import type { WakeWordState } from '@/shared/voice/wakeWord/useWakeWord'
import clsx from 'clsx'
import { AlertTriangle, Ear, EarOff, Loader2 } from 'lucide-react'

/**
 * Kitchen indicator for hands-free (ADR 0016): visible whenever the
 * microphone may be listening for «Oye Quanela»; one tap pauses or resumes.
 */
export function WakeWordIndicator({ state, error, paused, onToggle }: { state: WakeWordState; error: string | null; paused: boolean; onToggle: () => void }) {
  const view = paused
    ? { icon: EarOff, text: 'En pausa', label: 'Manos libres en pausa. Toca para volver a escuchar «Oye Quanela».', className: 'border-neutral-800 bg-neutral-900 text-neutral-500' }
    : state === 'error'
      ? {
          icon: AlertTriangle,
          text: 'Manos libres',
          label: error === 'not-allowed' ? 'Permiso de micrófono denegado. Toca para pausar.' : 'No se pudo iniciar «Oye Quanela». Toca para pausar.',
          className: 'border-red-800 bg-red-500/10 text-red-400',
        }
      : state === 'loading'
        ? { icon: Loader2, text: 'Preparando…', label: 'Preparando «Oye Quanela» en este equipo…', className: 'border-neutral-800 bg-neutral-900 text-neutral-400', spin: true }
        : { icon: Ear, text: 'Oye Quanela', label: 'Escuchando «Oye Quanela». Toca para pausar.', className: state === 'listening' ? 'border-brasa-500/50 bg-brasa-500/10 text-brasa-300' : 'border-neutral-800 bg-neutral-900 text-neutral-300' }
  const Icon = view.icon

  return (
    <Tooltip label={view.label} side="bottom">
      <button
        type="button"
        onClick={onToggle}
        aria-label={view.label}
        aria-pressed={!paused}
        className={clsx(
          'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
          view.className,
        )}
      >
        <span className="relative inline-flex">
          <Icon size={15} className={clsx('spin' in view && view.spin && 'animate-spin')} aria-hidden />
          {!paused && state === 'listening' && <span className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-brasa-400" aria-hidden />}
        </span>
        <span className="hidden sm:inline">{view.text}</span>
      </button>
    </Tooltip>
  )
}
