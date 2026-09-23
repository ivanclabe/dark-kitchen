import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Loader2, Mic, MicOff } from 'lucide-react'
import type { ComponentType } from 'react'
import type { VoicePhase } from './useVoiceCommandEngine'

const PHASE_CONTENT: Record<VoicePhase, { icon: ComponentType<{ size?: number; className?: string }>; label: string; className: string; iconClassName?: string }> = {
  idle: { icon: Mic, label: 'Dar un comando por voz', className: 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800' },
  listening: { icon: Mic, label: 'Escuchando…', className: 'border-brasa-500 bg-brasa-500/15 text-brasa-400', iconClassName: 'animate-pulse' },
  processing: { icon: Loader2, label: 'Procesando…', className: 'border-neutral-700 bg-neutral-900 text-neutral-300', iconClassName: 'animate-spin' },
  success: { icon: CheckCircle2, label: 'Actualizado', className: 'border-emerald-700 bg-emerald-500/10 text-emerald-400' },
  error: { icon: AlertTriangle, label: 'No entendí', className: 'border-red-800 bg-red-500/10 text-red-400' },
}

/** Botón de micrófono de un solo ícono; el color cuenta la fase (escuchando, procesando, ok, error). */
export function VoiceMicButton({ phase, onStart, disabled = false }: { phase: VoicePhase; onStart: () => void; disabled?: boolean }) {
  const { icon: Icon, label, className, iconClassName } = disabled
    ? { icon: MicOff, label: 'Voz disponible solo para los pedidos de hoy', className: 'border-neutral-800 bg-neutral-900 text-neutral-600', iconClassName: undefined }
    : PHASE_CONTENT[phase]
  const busy = phase === 'listening' || phase === 'processing'

  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        onClick={onStart}
        disabled={disabled || busy}
        aria-label={label}
        className={clsx(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500 disabled:cursor-not-allowed',
          className,
        )}
      >
        <Icon size={16} className={iconClassName} />
      </button>
    </Tooltip>
  )
}
