import { useCopilot } from '@/modules/copilot/copilotContext'
import { Drawer } from '@/shared/ui/Drawer'
import { Menu, type MenuItem } from '@/shared/ui/Menu'
import { Tooltip } from '@/shared/ui/Tooltip'
import clsx from 'clsx'
import { AlertTriangle, BookOpen, Ear, EarOff, Loader2, Mic, Pause, Play, Settings2, Sparkles, Square } from 'lucide-react'
import { useState } from 'react'
import { useVoice } from '../voiceContext'
import { VoiceDeviceSettings } from './VoiceDeviceSettings'
import { QuanelaVoiceIcon } from './VoiceIcon'
import { RobotThinking } from '@/shared/robot/RobotThinking'

/** While it wakes up (the phrase detector loading): one phrase, the same robot. */
const WAKING_STEPS = ['Despertando'] as const
/** The bubble tells the steps; the button only shows the robot. */
const PILL_STEPS = ['Pensando'] as const

/**
 * «Oye quanela» in the top bar (ADR 0033), the only assistant button there: an icon whose look tells its state
 * (waiting for the phrase, listening, answering, paused), a menu to speak now, switch hands-free on this device
 * or pause it, open Copilot, and this device's voice settings. Under it, what was heard and the answer. Answers
 * to voice questions wait in Copilot (ADR 0038): their count shows on this button.
 */
export function VoiceMenu() {
  const voice = useVoice()
  const copilot = useCopilot()
  const [settingsOpen, setSettingsOpen] = useState(false)
  if (!voice.available) return null

  const { handsFree } = voice
  const listeningForPhrase = handsFree.allowed && handsFree.on
  const routed = !voice.dictating
  const active = routed && (voice.state === 'listening' || voice.state === 'processing')

  const conversing = routed && voice.conversation.active
  const view = conversing
    ? voice.state === 'listening'
      ? { icon: QuanelaVoiceIcon, text: 'Conversación · te escucho', className: 'border-neutral-50 bg-neutral-50/15 text-neutral-50', iconClassName: 'animate-pulse' }
      : voice.state === 'processing'
        ? { icon: Loader2, text: 'Pensando…', className: 'border-neutral-50/40 bg-neutral-900 text-neutral-200', thinking: 'answer' as const }
        : { icon: QuanelaVoiceIcon, text: 'Conversación · respondiendo', className: 'border-neutral-50/40 bg-neutral-50/10 text-neutral-50' }
    : active
    ? voice.state === 'listening'
      ? { icon: QuanelaVoiceIcon, text: 'Escuchando…', className: 'border-neutral-50 bg-neutral-50/15 text-neutral-50', iconClassName: 'animate-pulse' }
      : { icon: Loader2, text: 'Pensando…', className: 'border-neutral-50/40 bg-neutral-900 text-neutral-200', thinking: 'answer' as const }
    : !listeningForPhrase
      ? { icon: QuanelaVoiceIcon, text: 'Oye quanela', className: 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200' }
      : handsFree.paused
        ? { icon: EarOff, text: 'En pausa', className: 'border-neutral-800 bg-neutral-900 text-neutral-500' }
        : handsFree.state === 'error'
          ? { icon: AlertTriangle, text: 'Oye quanela', className: 'border-red-500/50 bg-red-500/10 text-red-400' }
          : handsFree.state === 'loading'
            ? { icon: Loader2, text: 'Despertando…', className: 'border-neutral-800 bg-neutral-900 text-neutral-300', thinking: 'wake' as const }
            : { icon: QuanelaVoiceIcon, text: 'Oye quanela', className: 'border-neutral-50/40 bg-neutral-50/10 text-neutral-50' }
  const Icon = view.icon
  // ADR 0060: while it thinks (or wakes up), the robot itself shows it instead of a spinner.
  const thinking = 'thinking' in view ? view.thinking : null

  const stateLabel = conversing
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
  const unseen = copilot.available ? copilot.unseen : 0
  const label = unseen > 0 ? `${stateLabel}. ${unseen} ${unseen === 1 ? 'respuesta' : 'respuestas'} sin ver en Copilot` : stateLabel

  const items: MenuItem[] = [
    ...(conversing ? [{ label: 'Terminar conversación', icon: Square, onSelect: voice.conversation.end }] : []),
    { label: 'Hablar ahora (Ctrl/⌘ + Shift + J)', icon: Mic, onSelect: voice.listen },
    ...(handsFree.allowed ? [{ label: 'Manos libres en este equipo', icon: Ear, checked: handsFree.on, onSelect: () => handsFree.setOn(!handsFree.on) }] : []),
    ...(listeningForPhrase ? [{ label: handsFree.paused ? 'Reanudar' : 'Pausar', icon: handsFree.paused ? Play : Pause, onSelect: handsFree.togglePause }] : []),
    ...(copilot.available
      ? [{ label: unseen > 0 ? `Ver en Copilot (${unseen} sin ver)` : 'Abrir Copilot (Ctrl/⌘ + J)', icon: Sparkles, onSelect: copilot.open, separated: true }]
      : []),
    { label: 'Voz en este equipo', icon: Settings2, onSelect: () => setSettingsOpen(true), separated: !copilot.available },
  ]

  const showBubble = routed && voice.state !== 'idle' && (voice.state === 'listening' || voice.lastTranscript || voice.lastReply)

  return (
    <div className="relative">
      <Menu
        items={items}
        trigger={(props) => (
          <Tooltip label={label} side="bottom">
            <button
              type="button"
              {...props}
              aria-label={label}
              className={clsx(
                'relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                view.className,
              )}
            >
              {thinking ? (
                <RobotThinking size={22} steps={thinking === 'wake' ? WAKING_STEPS : PILL_STEPS} showText={false} />
              ) : (
                <span className="relative inline-flex">
                  <Icon size={18} className={'iconClassName' in view ? view.iconClassName : undefined} aria-hidden />
                  {listeningForPhrase && !handsFree.paused && handsFree.state === 'listening' && !active && (
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-neutral-50" aria-hidden />
                  )}
                </span>
              )}
              {unseen > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold text-on-primary tabular-nums ring-2 ring-neutral-950" aria-hidden>
                  {unseen > 9 ? '9+' : unseen}
                </span>
              ) : (
                copilot.available && copilot.pending && !thinking && (
                  <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-neutral-50 ring-2 ring-neutral-950" aria-hidden />
                )
              )}
            </button>
          </Tooltip>
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
                <a href={voice.lastReply.link.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-neutral-50 hover:underline">
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
