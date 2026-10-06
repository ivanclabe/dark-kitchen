import { Drawer } from '@/shared/ui/Drawer'
import { Menu, type MenuItem } from '@/shared/ui/Menu'
import clsx from 'clsx'
import { AlertTriangle, BookOpen, Ear, EarOff, Loader2, Mic, Pause, Play, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useVoice } from '../voiceContext'
import { VoiceDeviceSettings } from './VoiceDeviceSettings'

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

  const view = active
    ? voice.state === 'listening'
      ? { icon: Mic, text: 'Escuchando…', className: 'border-brasa-500 bg-brasa-500/15 text-brasa-300', iconClassName: 'animate-pulse' }
      : { icon: Loader2, text: 'Pensando…', className: 'border-neutral-700 bg-neutral-900 text-neutral-300', iconClassName: 'animate-spin' }
    : !listeningForPhrase
      ? { icon: Mic, text: 'Oye Quanela', className: 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200' }
      : handsFree.paused
        ? { icon: EarOff, text: 'En pausa', className: 'border-neutral-800 bg-neutral-900 text-neutral-500' }
        : handsFree.state === 'error'
          ? { icon: AlertTriangle, text: 'Oye Quanela', className: 'border-red-800 bg-red-500/10 text-red-400' }
          : handsFree.state === 'loading'
            ? { icon: Loader2, text: 'Preparando…', className: 'border-neutral-800 bg-neutral-900 text-neutral-400', iconClassName: 'animate-spin' }
            : { icon: Ear, text: 'Oye Quanela', className: 'border-brasa-500/40 bg-brasa-500/10 text-brasa-300' }
  const Icon = view.icon

  const label = active
    ? view.text
    : listeningForPhrase
      ? handsFree.paused
        ? 'Manos libres en pausa'
        : handsFree.state === 'error'
          ? handsFree.error === 'not-allowed'
            ? 'Permiso de micrófono denegado'
            : 'No se pudo iniciar «Oye Quanela»'
          : 'Escuchando «Oye Quanela» en este equipo'
      : 'Oye Quanela: háblale a Quanela'

  const items: MenuItem[] = [
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
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500',
              compact ? 'size-10 justify-center' : 'h-8 px-3 text-xs font-medium',
              view.className,
            )}
          >
            <span className="relative inline-flex">
              <Icon size={compact ? 16 : 13} className={view.iconClassName} aria-hidden />
              {listeningForPhrase && !handsFree.paused && handsFree.state === 'listening' && !active && (
                <span className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-brasa-400" aria-hidden />
              )}
            </span>
            {!compact && view.text}
          </button>
        )}
      />

      {/* What was heard and the answer — announced to screen readers too. */}
      <div role="status" aria-live="polite" className="sr-only">
        {voice.state === 'listening' ? 'Escuchando' : voice.state === 'processing' ? 'Consultando' : voice.lastReply?.message ?? ''}
      </div>
      {showBubble && (
        <div className="shadow-float absolute top-full right-0 z-40 mt-2 w-72 space-y-0.5 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs">
          {voice.state === 'listening' ? (
            <p className="text-neutral-300">{voice.liveTranscript ? `🎤 «${voice.liveTranscript}»` : 'Escuchando…'}</p>
          ) : (
            <>
              {voice.lastTranscript && <p className="text-neutral-500">🎤 «{voice.lastTranscript}»</p>}
              {voice.state === 'processing' && <p className="text-neutral-400">Consultando…</p>}
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
        <Drawer open onClose={() => setSettingsOpen(false)} title="Voz en este equipo" subtitle="Cómo te oye y te responde «Oye Quanela» aquí." size="md">
          <div className="space-y-6">
            <VoiceDeviceSettings />
          </div>
        </Drawer>
      )}
    </div>
  )
}
