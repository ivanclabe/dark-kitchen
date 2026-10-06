import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Drawer } from '@/shared/ui/Drawer'
import { useToast } from '@/shared/ui/Toast'
import clsx from 'clsx'
import { ArrowUp, Check, Copy, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { askCopilot, type CopilotAnswer, type CopilotTurn } from './api'
import { CopilotContext, useCopilot } from './copilotContext'
import { CopilotMarkdown } from './lib/markdown'
import { suggestionsFor } from './lib/suggestions'

interface Message {
  role: 'user' | 'assistant'
  content: string
  steps?: CopilotAnswer['steps']
  error?: boolean
}

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
}

/**
 * Quanela Copilot (ADR 0020) for the whole account: the ✦ button in the top
 * bar and Ctrl/⌘ + J open it. The conversation lives here (in the browser
 * only, while the account is open) so it survives moving between screens.
 * Shown only where the feature is usable (plan, organization, account, role).
 */
export function CopilotProvider({ children }: { children: ReactNode }) {
  const { canUseFeature, can, path, kitchen } = useActiveKitchen()
  const available = canUseFeature('copilot')
  const { pathname } = useLocation()
  const section = pathname.startsWith(path('/')) ? pathname.slice(path('/').length) || '/' : '/'
  const screen = Object.entries(SCREEN_NAME).find(([prefix]) => section === prefix || section.startsWith(`${prefix}/`))?.[1] ?? null

  const [isOpen, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)

  const open = useCallback(() => setOpen(true), [])

  useEffect(() => {
    if (!available) return
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [available])

  async function send(text: string) {
    const question = text.trim()
    if (!question || pending) return
    const history: CopilotTurn[] = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setDraft('')
    setPending(true)
    try {
      const result = await askCopilot(question, history, screen)
      setMessages((prev) => [...prev, { role: 'assistant', content: result.answer, steps: result.steps }])
      setRemaining(result.remainingToday)
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: err instanceof Error ? err.message : 'Copilot no pudo responder.', error: true }])
    } finally {
      setPending(false)
    }
  }

  return (
    <CopilotContext value={{ available, open }}>
      {children}
      {available && isOpen && (
        <CopilotPanel
          accountName={kitchen.name}
          messages={messages}
          suggestions={suggestionsFor(can, section)}
          draft={draft}
          pending={pending}
          remaining={remaining}
          onDraft={setDraft}
          onSend={(t) => void send(t)}
          onReset={() => setMessages([])}
          onClose={() => setOpen(false)}
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

function CopilotPanel({
  accountName,
  messages,
  suggestions,
  draft,
  pending,
  remaining,
  onDraft,
  onSend,
  onReset,
  onClose,
}: {
  accountName: string
  messages: Message[]
  suggestions: string[]
  draft: string
  pending: boolean
  remaining: number | null
  onDraft: (v: string) => void
  onSend: (text: string) => void
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
            className="flex items-end gap-2 rounded-2xl border border-neutral-700/70 bg-neutral-950 p-2 transition-colors focus-within:border-brasa-500/60"
          >
            <textarea
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={600}
              autoFocus
              placeholder="Escribe tu pregunta…"
              aria-label="Pregunta para Copilot"
              className="min-h-10 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || pending}
              aria-label="Enviar"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brasa-500 text-white transition-colors hover:bg-brasa-400 disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>Solo lectura · Ctrl/⌘ + J{remaining != null ? ` · ${remaining} consultas de IA hoy` : ''}</span>
            {messages.length > 0 && (
              <button type="button" onClick={onReset} className="inline-flex items-center gap-1 hover:text-neutral-300">
                <RotateCcw size={11} aria-hidden /> Nueva conversación
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-neutral-300">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-brasa-400" aria-hidden /> Pregunta sobre ventas, pedidos, cocina, platos, insumos, clientes, entregas o turnos.
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
              {m.error ? <p className="text-sm text-red-300">{m.content}</p> : <CopilotMarkdown text={m.content} onLink={onClose} />}
              <div className="flex flex-wrap items-center gap-2">
                {m.steps?.map((s, j) => (
                  <span key={j} className={clsx('rounded-full px-2 py-0.5 text-[10px]', s.ok ? 'bg-neutral-800 text-neutral-400' : 'bg-red-500/10 text-red-300')}>
                    {s.label}
                  </span>
                ))}
                {!m.error && <CopyButton text={m.content} />}
              </div>
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
  const { available, open } = useCopilot()
  if (!available) return null
  return (
    <button
      type="button"
      onClick={open}
      title="Quanela Copilot (Ctrl/⌘ + J)"
      aria-label="Abrir Quanela Copilot"
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border border-brasa-500/30 bg-brasa-500/10 text-brasa-300 transition-colors hover:bg-brasa-500/20',
        compact ? 'size-10 justify-center' : 'h-8 px-3 text-xs font-medium',
      )}
    >
      <Sparkles size={compact ? 16 : 13} aria-hidden />
      {!compact && 'Copilot'}
    </button>
  )
}
