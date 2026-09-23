import { AlertTriangle, CheckCircle2, Loader2, Mic } from 'lucide-react'
import type { ComponentType } from 'react'
import type { VoicePhase } from './useVoiceCommandEngine'

const PHASE_CONTENT: Record<
  VoicePhase,
  { icon: ComponentType<{ size?: number; className?: string }>; label: string; className: string; iconClassName?: string }
> = {
  idle: {
    icon: Mic,
    label: 'Escuchar',
    className: 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800',
  },
  listening: {
    icon: Mic,
    label: 'Escuchando…',
    className: 'border-brasa-500 bg-brasa-500/10 text-brasa-400 shadow-[0_0_0_3px_var(--color-brasa-500)]/10',
    iconClassName: 'animate-pulse',
  },
  processing: {
    icon: Loader2,
    label: 'Procesando…',
    className: 'border-neutral-700 bg-neutral-900 text-neutral-300',
    iconClassName: 'animate-spin',
  },
  success: {
    icon: CheckCircle2,
    label: 'Actualizado',
    className: 'border-emerald-700 bg-emerald-500/10 text-emerald-400',
  },
  error: { icon: AlertTriangle, label: 'No entendí', className: 'border-red-800 bg-red-500/10 text-red-400' },
}

export function VoiceMicButton({ phase, onStart }: { phase: VoicePhase; onStart: () => void }) {
  const { icon: Icon, label, className, iconClassName } = PHASE_CONTENT[phase]
  const disabled = phase === 'listening' || phase === 'processing'

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-80 ${className}`}
    >
      <Icon size={16} className={iconClassName} />
      {label}
    </button>
  )
}
