import { useVoiceFlag } from '@/modules/voice/prefs'
import { helpHref } from '@/shared/help/helpUrl'
import { useVoice, useVoiceHandler } from '@/modules/voice/voiceContext'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Drawer } from '@/shared/ui/Drawer'
import { useToast } from '@/shared/ui/Toast'
import clsx from 'clsx'
import { ArrowUp, BookOpen, Check, Copy, ExternalLink, Loader2, Mic, RotateCcw, Sparkles, Square, ThumbsDown, ThumbsUp, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { whenSpoken } from '@/shared/voice/speechQueue'
import {
  askCopilot,
  cancelCopilot,
  CopilotError,
  rateCopilotAnswer,
  reportCopilotTimings,
  warmCopilot,
  type CopilotAnswer,
  type CopilotClientTimings,
  type CopilotScope,
  type CopilotTurn,
} from './api'
import { CopilotContext, useCopilot } from './copilotContext'
import { historyFor, loadConversation, saveConversation, type CopilotMessage } from './lib/conversation'
import { CopilotMarkdown } from './lib/markdown'
import { suggestionsFor } from './lib/suggestions'

type Message = CopilotMessage

const SCREEN_NAME: Record<string, string> = {
  '/dashboard': 'Inicio',
  '/operations': 'Centro de operaciones',
  '/menu-planner': 'Catálogo',
  '/recipes': 'Recetas',
  '/supply': 'Abastecimiento',
  '/customers': 'Clientes',
  '/staff': 'Personal',
  '/my-shifts': 'Mis turnos',
  '/insights': 'Insights',
  '/settings': 'Configuración',
  '/users': 'Usuarios',
  '/perfil': 'Mi perfil',
}

/** A small label when the answer is not a plain «answered» (ADR 0033, the scopes). */
const SCOPE_LABEL: Partial<Record<CopilotScope, string>> = {
  partial: 'Respuesta parcial',
  no_data: 'Sin datos',
  not_allowed: 'Tu rol no lo permite',
  unsupported: 'Quanela no guarda ese dato',
  out_of_scope: 'Fuera del negocio',
  action: 'Solo consulto',
  clarify: 'Necesito precisar',
}

const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

/**
 * Quanela Copilot (ADR 0020, ADR 0033) for the whole account: the ✦ button in
 * the top bar and Ctrl/⌘ + J open it; «Oye Quanela» sends it every question
 * no screen took, and reads the spoken summary aloud. The conversation lives
 * here (in the browser only, while the account is open) so it survives moving
 * between screens. Shown only where the feature is usable.
 */
export function CopilotProvider({ children }: { children: ReactNode }) {
  const { canUseFeature, can, path, kitchen } = useActiveKitchen()
  const voice = useVoice()
  const [readTyped, setReadTyped] = useVoiceFlag('readTyped', false)
  const available = canUseFeature('copilot')
  const { pathname } = useLocation()
  const section = pathname.startsWith(path('/')) ? pathname.slice(path('/').length) || '/' : '/'
  const screen = Object.entries(SCREEN_NAME).find(([prefix]) => section === prefix || section.startsWith(`${prefix}/`))?.[1] ?? null

  const [isOpen, setOpen] = useState(false)
  // ADR 0038: the conversation survives a reload of this tab (30 min), per account.
  const [messages, setMessages] = useState<Message[]>(() => loadConversation(kitchen.id))
  const [unseen, setUnseen] = useState(0)
  const isOpenRef = useRef(isOpen)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const messagesRef = useRef(messages)
  const inFlight = useRef<{ abort: AbortController; requestId: string } | null>(null)
  useEffect(() => {
    messagesRef.current = messages
    isOpenRef.current = isOpen
  })
  useEffect(() => saveConversation(kitchen.id, messages), [kitchen.id, messages])

  const open = useCallback(() => {
    setOpen(true)
    setUnseen(0)
  }, [])

  useEffect(() => {
    if (!available) return
    function onKey(e: globalThis.KeyboardEvent) {
      // Ctrl/⌘ + Shift + J is «Oye Quanela» (speak now), not this.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault()
        setUnseen(0)
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [available])

  /** Asks one question; null if it was cancelled. Errors come back as a message (and are thrown for the voice). */
  const ask = useCallback(
    async (
      text: string,
      channel: 'voice' | 'text',
      signal?: AbortSignal,
      voiceOptions?: { client: CopilotClientTimings; onSpoken: (spoken: string) => void },
    ): Promise<CopilotAnswer | null> => {
      const question = text.trim()
      if (!question) return null
      inFlight.current?.abort.abort()
      const abort = new AbortController()
      signal?.addEventListener('abort', () => abort.abort())
      const requestId = newRequestId()
      inFlight.current = { abort, requestId }
      const history: CopilotTurn[] = historyFor(messagesRef.current)
      setMessages((prev) => [...prev, { role: 'user', content: question, channel }])
      setPending(true)
      try {
        const result = await askCopilot({ question, history, screen, channel, requestId, signal: abort.signal, ...voiceOptions })
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.answer,
            intent: result.intent,
            steps: result.steps,
            scope: result.scope,
            followUp: result.followUp,
            links: result.links,
            runId: result.runId,
            feedback: null,
            channel,
          },
        ])
        // Answered while the panel is closed (by voice): one more to see on ✦.
        if (!isOpenRef.current) setUnseen((n) => n + 1)
        setRemaining(result.remainingToday)
        return result
      } catch (err) {
        if (abort.signal.aborted) {
          void cancelCopilot(requestId)
          setMessages((prev) => [...prev, { role: 'assistant', content: 'Consulta cancelada.', error: true, retryQuestion: question, retryable: true }])
          return null
        }
        const e = err instanceof CopilotError ? err : new CopilotError('Copilot no pudo responder.', 'AI_ERROR', true)
        setMessages((prev) => [...prev, { role: 'assistant', content: e.message, error: true, retryQuestion: question, retryable: e.retryable }])
        throw e
      } finally {
        if (inFlight.current?.requestId === requestId) inFlight.current = null
        setPending(false)
      }
    },
    [screen],
  )

  /** A typed (or dictated) question in the panel. */
  const send = useCallback(
    async (text: string, channel: 'voice' | 'text' = 'text') => {
      if (!text.trim() || pending) return
      setDraft('')
      try {
        const result = await ask(text, channel)
        // Asked by voice: always read (if this device reads replies); typed: only with 🔊.
        if (result && (channel === 'voice' ? voice.replies : readTyped)) voice.say(result.spoken, 'answer')
      } catch {
        // Already shown as a message.
      }
    },
    [ask, pending, voice, readTyped],
  )

  const stop = useCallback(() => {
    inFlight.current?.abort.abort()
    voice.stop()
  }, [voice])

  // «Oye Quanela»: every phrase no screen took is a question for Copilot.
  useVoiceHandler(
    available
      ? {
          id: 'copilot',
          fallback: true,
          // ADR 0041 (D4): wake the function while the person is still speaking.
          prepare: () => warmCopilot(),
          handle: async (text, { signal, turn }) => {
            // ADR 0038: the voice does not open the panel; the answer is heard and ✦ shows it is there.
            const askedAt = Date.now()
            let spokenAt: number | null = null
            let early: string | null = null
            let speechStart: Promise<number | null> | null = null
            try {
              const result = await ask(text, 'voice', signal, {
                client: {
                  wake: turn.wake,
                  followUp: turn.followUp,
                  ...(turn.listenMs !== null ? { listenMs: turn.listenMs } : {}),
                  ...(turn.endpointMs !== null ? { endpointMs: turn.endpointMs } : {}),
                },
                // ADR 0041 (D7): the sentence to say arrives before the whole answer: say it now.
                onSpoken: (spoken) => {
                  if (early !== null || signal.aborted) return
                  early = spoken
                  spokenAt = Date.now()
                  if (voice.replies) {
                    speechStart = whenSpoken(spoken)
                    voice.say(spoken, 'answer')
                  }
                },
              })
              if (!result) return null
              if (early === null) {
                spokenAt = Date.now()
                if (voice.replies) speechStart = whenSpoken(result.spoken)
              }
              // ADR 0041 (D1): until Quanela actually speaks, on the person's own run.
              const measured = speechStart as Promise<number | null> | null
              void (async () => {
                const startedSpeaking = measured ? await measured : null
                await reportCopilotTimings(result.runId, {
                  streamed: early !== null,
                  requestMs: (spokenAt ?? askedAt) - askedAt,
                  ...(startedSpeaking !== null ? { speechMs: startedSpeaking - (spokenAt ?? askedAt) } : {}),
                  ...(startedSpeaking !== null && turn.lastWordAt !== null ? { totalMs: startedSpeaking - turn.lastWordAt } : {}),
                }).catch(() => undefined)
              })()
              const article = result.links?.[0]
              return {
                tone: result.scope === 'answered' ? 'success' : 'info',
                message: result.spoken,
                // Already said as it arrived: not again.
                spoken: early === null ? result.spoken : null,
                priority: 'answer',
                link: article ? { href: helpHref(article.url), label: article.title } : undefined,
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'No pude consultar.'
              return { tone: 'error', message, spoken: 'No pude consultar, intenta de nuevo.', priority: 'answer' }
            }
          },
        }
      : null,
  )

  async function rate(index: number, value: 1 | -1) {
    const m = messages[index]
    if (!m?.runId) return
    const next = m.feedback === value ? null : value
    setMessages((prev) => prev.map((x, i) => (i === index ? { ...x, feedback: next } : x)))
    try {
      await rateCopilotAnswer(m.runId, next)
    } catch {
      setMessages((prev) => prev.map((x, i) => (i === index ? { ...x, feedback: m.feedback ?? null } : x)))
    }
  }

  return (
    <CopilotContext value={{ available, open, unseen, pending }}>
      {children}
      {available && isOpen && (
        <CopilotPanel
          accountName={kitchen.name}
          messages={messages}
          suggestions={suggestionsFor(can, section)}
          draft={draft}
          pending={pending}
          remaining={remaining}
          readTyped={readTyped}
          canSpeak={voice.speechAllowed}
          canDictate={voice.available}
          dictating={voice.dictating}
          onDraft={setDraft}
          onSend={(t, channel) => void send(t, channel)}
          onDictate={() => voice.dictate({ onTranscript: setDraft, onDone: (t) => void send(t, 'voice') })}
          onStop={stop}
          onToggleRead={() => setReadTyped(!readTyped)}
          onRate={(i, v) => void rate(i, v)}
          onReset={() => setMessages([])}
          onClose={() => {
            setOpen(false)
            setUnseen(0)
          }}
        />
      )}
    </CopilotContext>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const { show } = useToast()
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => show('No se pudo copiar', 'error'),
        )
      }
      className="inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-200"
    >
      {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />} {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

const iconButton =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500'

function CopilotPanel({
  accountName,
  messages,
  suggestions,
  draft,
  pending,
  remaining,
  readTyped,
  canSpeak,
  canDictate,
  dictating,
  onDraft,
  onSend,
  onDictate,
  onStop,
  onToggleRead,
  onRate,
  onReset,
  onClose,
}: {
  accountName: string
  messages: Message[]
  suggestions: string[]
  draft: string
  pending: boolean
  remaining: number | null
  readTyped: boolean
  canSpeak: boolean
  canDictate: boolean
  dictating: boolean
  onDraft: (v: string) => void
  onSend: (text: string, channel?: 'voice' | 'text') => void
  onDictate: () => void
  onStop: () => void
  onToggleRead: () => void
  onRate: (index: number, value: 1 | -1) => void
  onReset: () => void
  onClose: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pending])

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend(draft)
    }
  }

  const last = messages.length - 1
  const busy = pending || dictating

  return (
    <Drawer
      open
      onClose={onClose}
      title="Quanela Copilot"
      subtitle={`Responde con los datos de ${accountName} y lo que tu rol puede ver.`}
      size="md"
      footer={
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSend(draft)
            }}
            className="flex items-end gap-1.5 rounded-2xl border border-neutral-700/70 bg-neutral-950 p-2 transition-colors focus-within:border-brasa-500/60"
          >
            <textarea
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={600}
              autoFocus
              placeholder={dictating ? 'Escuchando… (puedes corregir antes de enviar)' : 'Escribe tu pregunta…'}
              aria-label="Pregunta para Copilot"
              className="min-h-10 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
            {canDictate && !busy && (
              <button type="button" onClick={onDictate} aria-label="Dictar la pregunta" title="Dictar la pregunta (se envía tras una pausa)" className={iconButton}>
                <Mic size={16} aria-hidden />
              </button>
            )}
            {busy ? (
              <button type="button" onClick={onStop} aria-label="Detener" title="Detener" className={clsx(iconButton, 'bg-neutral-800 text-neutral-100')}>
                <Square size={14} aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Enviar"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brasa-500 text-white transition-colors hover:bg-brasa-400 disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                <ArrowUp size={16} aria-hidden />
              </button>
            )}
          </form>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
            <span>
              Solo lectura · Ctrl/⌘ + J{canDictate ? ' · Ctrl/⌘ + Shift + J para hablar' : ''}
              {remaining != null ? ` · ${remaining} preguntas hoy` : ''}
            </span>
            <span className="flex items-center gap-3">
              {canSpeak && (
                <button type="button" onClick={onToggleRead} aria-pressed={readTyped} className="inline-flex items-center gap-1 hover:text-neutral-300" title="Leer en voz alta las respuestas a lo que escribes">
                  {readTyped ? <Volume2 size={11} aria-hidden /> : <VolumeX size={11} aria-hidden />} Leer respuestas
                </button>
              )}
              {messages.length > 0 && (
                <button type="button" onClick={onReset} className="inline-flex items-center gap-1 hover:text-neutral-300">
                  <RotateCcw size={11} aria-hidden /> Nueva conversación
                </button>
              )}
            </span>
          </div>
        </>
      }
    >
      <div className="space-y-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-neutral-300">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-brasa-400" aria-hidden /> Pregunta sobre ventas, pedidos, cocina, platos, insumos, clientes, cobros, entregas o turnos,
              o dónde se hace algo en Quanela.
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSend(s)}
                  className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:border-brasa-500/50 hover:bg-neutral-800/60"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-brasa-500/15 px-3.5 py-2 text-sm text-neutral-100">
              {m.content}
            </div>
          ) : (
            <div key={i} className={clsx('space-y-2', m.error && 'rounded-xl border border-red-500/30 bg-red-500/5 p-3')}>
              {m.scope && SCOPE_LABEL[m.scope] && <span className="inline-block rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">{SCOPE_LABEL[m.scope]}</span>}
              {m.error ? <p className="text-sm text-red-300">{m.content}</p> : <CopilotMarkdown text={m.content} onLink={onClose} />}
              {/* ADR 0034: the help article that answers it, from the help center (opens apart, the conversation stays). */}
              {m.links && m.links.length > 0 && (
                <div className="space-y-1.5">
                  {m.links.map((l) => (
                    <a
                      key={l.id}
                      href={helpHref(l.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-brasa-500/30 bg-brasa-500/5 px-3 py-2 text-sm text-neutral-100 transition-colors hover:border-brasa-500/60 hover:bg-brasa-500/10"
                    >
                      <BookOpen size={14} className="shrink-0 text-brasa-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{l.title}</span>
                        <span className="block text-[11px] text-neutral-500">Centro de ayuda</span>
                      </span>
                      <ExternalLink size={12} className="shrink-0 text-neutral-500" aria-hidden />
                    </a>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {m.steps?.map((s, j) => (
                  <span key={j} className={clsx('rounded-full px-2 py-0.5 text-[10px]', s.ok ? 'bg-neutral-800 text-neutral-400' : 'bg-red-500/10 text-red-300')}>
                    {s.label}
                  </span>
                ))}
                {m.error && m.retryable && m.retryQuestion && !pending && (
                  <button type="button" onClick={() => onSend(m.retryQuestion!)} className="inline-flex items-center gap-1 text-[11px] text-neutral-300 hover:text-neutral-50">
                    <RotateCcw size={11} aria-hidden /> Reintentar
                  </button>
                )}
                {!m.error && <CopyButton text={m.content} />}
                {!m.error && m.runId && (
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onRate(i, 1)}
                      aria-pressed={m.feedback === 1}
                      aria-label="Buena respuesta"
                      className={clsx('rounded p-1', m.feedback === 1 ? 'text-emerald-400' : 'text-neutral-600 hover:text-neutral-300')}
                    >
                      <ThumbsUp size={12} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRate(i, -1)}
                      aria-pressed={m.feedback === -1}
                      aria-label="Mala respuesta"
                      className={clsx('rounded p-1', m.feedback === -1 ? 'text-red-400' : 'text-neutral-600 hover:text-neutral-300')}
                    >
                      <ThumbsDown size={12} aria-hidden />
                    </button>
                  </span>
                )}
              </div>
              {i === last && !pending && m.followUp && m.followUp.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.followUp.map((q) => (
                    <button key={q} type="button" onClick={() => onSend(q)} className="rounded-full border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:border-brasa-500/50 hover:text-neutral-100">
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {pending && (
          <p role="status" className="flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Consultando los datos…
          </p>
        )}
        <div ref={endRef} />
      </div>
    </Drawer>
  )
}

/** The ✦ button of the top bar. */
export function CopilotButton({ compact = false }: { compact?: boolean }) {
  const { available, open, unseen, pending } = useCopilot()
  if (!available) return null
  const label = unseen > 0 ? `Abrir Quanela Copilot: ${unseen} ${unseen === 1 ? 'respuesta' : 'respuestas'} sin ver` : pending ? 'Abrir Quanela Copilot: consultando' : 'Abrir Quanela Copilot'
  return (
    <button
      type="button"
      onClick={open}
      title={`${label} (Ctrl/⌘ + J)`}
      aria-label={label}
      className={clsx(
        'relative inline-flex items-center gap-1.5 rounded-full border border-brasa-500/30 bg-brasa-500/10 text-brasa-300 transition-colors hover:bg-brasa-500/20',
        compact ? 'size-10 justify-center' : 'h-8 px-3 text-xs font-medium',
      )}
    >
      <Sparkles size={compact ? 16 : 13} aria-hidden />
      {!compact && 'Copilot'}
      {/* ADR 0038: answers by voice wait here (the voice never opens the panel). */}
      {unseen > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brasa-500 px-1 text-[10px] font-semibold text-white tabular-nums ring-2 ring-neutral-950" aria-hidden>
          {unseen > 9 ? '9+' : unseen}
        </span>
      ) : (
        pending && <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-brasa-400 ring-2 ring-neutral-950" aria-hidden />
      )}
    </button>
  )
}
