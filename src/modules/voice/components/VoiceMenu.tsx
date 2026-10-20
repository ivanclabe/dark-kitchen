import { Drawer } from '@/shared/ui/Drawer'
import { Menu, type MenuItem } from '@/shared/ui/Menu'
import clsx from 'clsx'
import { AlertTriangle, BookOpen, Ear, EarOff, Loader2, MessagesSquare, Mic, Pause, Play, Settings2, Square } from 'lucide-react'
import { useState } from 'react'
import { useVoice } from '../voiceContext'
import { VoiceDeviceSettings } from './VoiceDeviceSettings'
import { RobotThinking } from '@/shared/robot/RobotThinking'

/** While it wakes up (the phrase detector loading): one phrase, the same robot. */
const WAKING_STEPS = ['Despertando'] as const
/** The top bar keeps one word (its width does not jump); the bubble tells the steps. */
const PILL_STEPS = ['Pensando'] as const

/**
 * «Oye Quanela» in the top bar (ADR 0033), next to Copilot: its state at a
 * glance (waiting for the phrase, listening, answering, paused), a menu to
 * speak now, switch hands-free on this device or pause it, and this device's
 * voice settings. Under it, what was heard and the answer.
 */
export function VoiceMenu({ compact = false }: { compact?: boolean }) {
  const voice = useVoice()
  const [settingsOpen, setSettingsOpen] = useState(false)
  if (!voice.available) return null

  const { handsFree } = voice
  const listeningForPhrase = handsFree.allowed && handsFree.on
  const routed = !voice.dictating
  const active = routed && (voice.state === 'listening' || voice.state === 'processing')

  const conversing = routed && voice.conversation.active
  const view = conversing
    ? voice.state === 'listening'
      ? { icon: Mic, text: 'Conversación · te escucho', className: 'border-brasa-500 bg-brasa-500/15 text-brasa-300', iconClassName: 'animate-pulse' }
      : voice.state === 'processing'
        ? { icon: Loader2, text: 'Pensando…', className: 'border-brasa-500/40 bg-neutral-900 text-neutral-200', thinking: 'answer' as const }
        : { icon: MessagesSquare, text: 'Conversación · respondiendo', className: 'border-brasa-500/40 bg-brasa-500/10 text-brasa-300' }
    : active
    ? voice.state === 'listening'
      ? { icon: Mic, text: 'Escuchando…', className: 'border-brasa-500 bg-brasa-500/15 text-brasa-300', iconClassName: 'animate-pulse' }
      : { icon: Loader2, text: 'Pensando…', className: 'border-brasa-500/40 bg-neutral-900 text-neutral-200', thinking: 'answer' as const }
    : !listeningForPhrase
      ? { icon: Mic, text: 'Oye quanela', className: 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200' }
      : handsFree.paused
        ? { icon: EarOff, text: 'En pausa', className: 'border-neutral-800 bg-neutral-900 text-neutral-500' }
        : handsFree.state === 'error'
          ? { icon: AlertTriangle, text: 'Oye quanela', className: 'border-red-500/50 bg-red-500/10 text-red-400' }
          : handsFree.state === 'loading'
            ? { icon: Loader2, text: 'Despertando…', className: 'border-neutral-800 bg-neutral-900 text-neutral-300', thinking: 'wake' as const }
            : { icon: Ear, text: 'Oye quanela', className: 'border-brasa-500/40 bg-brasa-500/10 text-brasa-300' }
  const Icon = view.icon
  // ADR 0060: while it thinks (or wakes up), the robot itself shows it instead of a spinner.
  const thinking = 'thinking' in view ? view.thinking : null

  const label = conversing
    ? `${view.text}. Di tu siguiente pregunta o «gracias» para terminar.`
    : active
    ? view.text
    : listeningForPhrase
      ? handsFree.paused
        ? 'Manos libres en pausa'
        : handsFree.state === 'error'
          ? handsFree.error === 'not-allowed'
            ? 'Permiso de micrófono denegado'
            : 'No se pudo iniciar «Oye quanela»'
          : 'Escuchando «Oye quanela» en este equipo'
      : 'Oye quanela: háblale a quanela'

  const items: MenuItem[] = [
    ...(conversing ? [{ label: 'Terminar conversación', icon: Square, onSelect: voice.conversation.end }] : []),
    { label: 'Hablar ahora (Ctrl/⌘ + Shift + J)', icon: Mic, onSelect: voice.listen },
    ...(handsFree.allowed ? [{ label: 'Manos libres en este equipo', icon: Ear, checked: handsFree.on, onSelect: () => handsFree.setOn(!handsFree.on) }] : []),
    ...(listeningForPhrase ? [{ label: handsFree.paused ? 'Reanudar' : 'Pausar', icon: handsFree.paused ? Play : Pause, onSelect: handsFree.togglePause }] : []),
    { label: 'Voz en este equipo', icon: Settings2, onSelect: () => setSettingsOpen(true), separated: true },
  ]

  const showBubble = routed && voice.state !== 'idle' && (voice.state === 'listening' || voice.lastTranscript || voice.lastReply)

  return (
    <div className="relative">
      <Menu
        items={items}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={label}
            title={label}
            className={clsx(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              compact ? 'size-10 justify-center' : 'h-8 px-3 text-xs font-medium',
              view.className,
            )}
          >
            {thinking ? (
              <RobotThinking size={compact ? 22 : 16} steps={thinking === 'wake' ? WAKING_STEPS : PILL_STEPS} showText={!compact} className={compact ? undefined : '-ml-1.5 gap-1.5'} />
            ) : (
              <>
                <span className="relative inline-flex">
                  <Icon size={compact ? 16 : 13} className={'iconClassName' in view ? view.iconClassName : undefined} aria-hidden />
                  {listeningForPhrase && !handsFree.paused && handsFree.state === 'listening' && !active && (
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-brasa-400" aria-hidden />
                  )}
                </span>
                {!compact && view.text}
              </>
            )}
          </button>
        )}
      />

      {/* What was heard and the answer — announced to screen readers too. */}
      <div role="status" aria-live="polite" className="sr-only">
        {voice.state === 'listening' ? 'Escuchando' : voice.state === 'processing' ? 'Consultando' : voice.lastReply?.message ?? ''}
      </div>
      {showBubble && (
        <div className="shadow-float absolute top-full right-0 z-40 mt-2 w-72 max-w-[calc(100vw-1.5rem)] space-y-0.5 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs">
          {voice.state === 'listening' ? (
            <p className="text-neutral-300">{voice.liveTranscript ? `🎤 «${voice.liveTranscript}»` : 'Escuchando…'}</p>
          ) : (
            <>
              {voice.lastTranscript && <p className="text-neutral-500">🎤 «{voice.lastTranscript}»</p>}
              {voice.state === 'processing' && <RobotThinking size={30} className="pt-1.5 text-neutral-300" textClassName="text-sm" />}
              {voice.lastReply && voice.state !== 'processing' && (
                <p className={clsx(voice.state === 'error' ? 'text-red-400' : voice.lastReply.tone === 'info' ? 'text-neutral-300' : 'text-emerald-400')}>{voice.lastReply.message}</p>
              )}
              {voice.lastReply?.link && voice.state !== 'processing' && (
                <a href={voice.lastReply.link.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-brasa-300 hover:underline">
                  <BookOpen size={12} aria-hidden /> Abrir guía: {voice.lastReply.link.label}
                </a>
              )}
            </>
          )}
        </div>
      )}

      {settingsOpen && (
        <Drawer open onClose={() => setSettingsOpen(false)} title="Voz en este equipo" subtitle="Cómo te oye y te responde «Oye quanela» aquí." size="md">
          <div className="space-y-6">
            <VoiceDeviceSettings />
          </div>
        </Drawer>
      )}
    </div>
  )
}
