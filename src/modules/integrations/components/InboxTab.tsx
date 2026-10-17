import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import clsx from 'clsx'
import { Bot, Check, CheckCheck, CircleAlert, Clock, Hand, Inbox, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useInboxActions, useWaConversations, useWaMessages } from '../hooks'
import { prettyPhone } from '../lib/whatsapp'
import type { OrderingMode, WaConversation, WaMessage } from '../types'

const AUTHOR: Record<WaMessage['author'], string> = { customer: 'Cliente', assistant: 'Asistente', staff: 'Equipo', system: 'Automático' }

const within24h = (c: WaConversation) => !!c.last_inbound_at && Date.now() - new Date(c.last_inbound_at).getTime() < 24 * 3600 * 1000

/** WhatsApp's own formatting: *bold* and _italic_ (nothing else, no HTML). */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : /^_[^_]+_$/.test(p) ? <em key={i}>{p.slice(1, -1)}</em> : <span key={i}>{p}</span>,
      )}
    </>
  )
}

function Delivery({ m }: { m: WaMessage }) {
  const s = m.outbox?.status
  if (m.direction === 'in' || !s) return null
  if (s === 'failed') return <CircleAlert size={12} className="text-red-400" aria-label={m.outbox?.last_error ?? 'No se pudo enviar'} />
  if (s === 'read') return <CheckCheck size={12} className="text-sky-400" aria-label="Leído" />
  if (s === 'delivered') return <CheckCheck size={12} aria-label="Entregado" />
  if (s === 'sent') return <Check size={12} aria-label="Enviado" />
  return <Clock size={12} aria-label="Enviando" />
}

/**
 * Mensajes (ADR 0055): the WhatsApp inbox. Conversations that need a person
 * first; answering takes the conversation (the assistant or n8n stop) and it
 * can be given back. Free text only within 24 h of the customer's last message.
 */
export function InboxTab({ orderingMode, canReply }: { orderingMode: OrderingMode; canReply: boolean }) {
  const [filter, setFilter] = useState<'attention' | 'all'>('all')
  const conversations = useWaConversations(filter)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = conversations.data?.find((c) => c.id === selectedId) ?? null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex gap-1.5" role="group" aria-label="Filtrar conversaciones">
          <Chip label="Todas" active={filter === 'all'} onClick={() => setFilter('all')} />
          <Chip label="Necesitan atención" active={filter === 'attention'} onClick={() => setFilter('attention')} />
        </div>
        {conversations.isLoading ? (
          <LoadingState variant="block" label="Cargando…" />
        ) : !conversations.data?.length ? (
          <EmptyState icon={Inbox} title="Sin conversaciones" description="Cuando un cliente le escriba a tu número de WhatsApp, aparecerá aquí." compact />
        ) : (
          <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
            {conversations.data.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-current={c.id === selectedId}
                  className={clsx('flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-neutral-800/40', c.id === selectedId && 'bg-neutral-800/60')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm text-neutral-100">
                      <span className="truncate">{c.customer_name ?? prettyPhone(c.phone)}</span>
                      {c.status === 'bot' && orderingMode === 'ai' && <Bot size={13} className="shrink-0 text-neutral-500" aria-label="Lo atiende el asistente" />}
                      {c.status === 'human' && <Hand size={13} className="shrink-0 text-neutral-500" aria-label="Lo atiende una persona" />}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {c.needs_attention ? c.attention_reason ?? 'Necesita atención' : c.last_message_at ? formatDateTime(c.last_message_at) : ''}
                    </p>
                  </div>
                  {c.needs_attention && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-400" aria-label="Necesita atención" />}
                  {c.unread > 0 && <Badge tone="brand">{c.unread}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected ? <Thread conversation={selected} canReply={canReply} orderingMode={orderingMode} /> : (
        <div className="hidden min-h-[420px] items-center justify-center rounded-xl border border-dashed border-neutral-800 text-sm text-neutral-500 lg:flex">Elige una conversación.</div>
      )}
    </div>
  )
}

function Thread({ conversation: c, canReply, orderingMode }: { conversation: WaConversation; canReply: boolean; orderingMode: OrderingMode }) {
  const { show } = useToast()
  const messages = useWaMessages(c.id)
  const { send, setStatus } = useInboxActions()
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const open = within24h(c)
  const count = messages.data?.length ?? 0

  // Stay at the latest message (only the thread scrolls, never the page).
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count, c.id])
  // Opening it marks it read.
  useEffect(() => {
    if (canReply && (c.unread > 0 || c.needs_attention)) void setStatus.mutateAsync({ id: c.id, status: null }).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id])

  async function submit() {
    const body = text.trim()
    if (!body) return
    try {
      await send.mutateAsync({ id: c.id, text: body })
      setText('')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo enviar'), 'error')
    }
  }

  return (
    <section className="flex h-[min(680px,calc(100dvh-220px))] min-h-[440px] flex-col overflow-hidden rounded-xl border border-neutral-800" aria-label={`Conversación con ${c.customer_name ?? c.phone}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <div className="min-w-[9rem] flex-1">
          <p className="text-sm font-medium text-neutral-100">{c.customer_name ?? prettyPhone(c.phone)}</p>
          <p className="text-xs text-neutral-500 tabular-nums">
            {prettyPhone(c.phone)}
            {c.last_order && (
              <>
                {' · '}
                <KitchenLink to={`/orders/${c.last_order_id}`} className="text-brasa-400 hover:underline">
                  pedido #{c.last_order.order_number}
                </KitchenLink>
              </>
            )}
          </p>
        </div>
        {c.status === 'human' ? (
          <Badge tone="warning">Lo atiende una persona</Badge>
        ) : c.status === 'closed' ? (
          <Badge tone="neutral">Cerrada</Badge>
        ) : (
          <Badge tone="info">{orderingMode === 'ai' ? 'Lo atiende el asistente' : orderingMode === 'n8n' ? 'Lo atiende n8n' : 'Abierta'}</Badge>
        )}
        {canReply && (
          <div className="flex gap-1.5">
            {c.status !== 'human' && (
              <Button size="sm" variant="secondary" icon={Hand} onClick={() => void setStatus.mutateAsync({ id: c.id, status: 'human' })}>
                Tomar
              </Button>
            )}
            {c.status === 'human' && orderingMode !== 'off' && (
              <Button size="sm" variant="secondary" icon={Bot} onClick={() => void setStatus.mutateAsync({ id: c.id, status: 'bot' })}>
                {orderingMode === 'ai' ? 'Devolver al asistente' : 'Devolver a n8n'}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={X} onClick={() => void setStatus.mutateAsync({ id: c.id, status: 'closed' })}>
              Cerrar
            </Button>
          </div>
        )}
      </header>
      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto bg-[#0b141a] px-4 py-4">
        {messages.isLoading ? (
          <LoadingState variant="inline" label="Cargando…" />
        ) : (
          messages.data?.map((m) => (
            <div key={m.id} className={clsx('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
              <div className={clsx('max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap', m.direction === 'out' ? 'rounded-tr-none bg-[#005c4b] text-neutral-50' : 'rounded-tl-none bg-[#202c33] text-neutral-100')}>
                {m.direction === 'out' && <p className="mb-0.5 text-[11px] font-medium text-emerald-200/80">{AUTHOR[m.author]}</p>}
                <WaText text={m.body ?? ''} />
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-neutral-400">
                  {new Date(m.created_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}
                  <Delivery m={m} />
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      {canReply && (
        <form
          className="flex gap-2 border-t border-neutral-800 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void submit()
              }
            }}
            disabled={!open}
            rows={1}
            maxLength={4096}
            aria-label="Mensaje"
            placeholder={open ? 'Escribe tu respuesta…' : 'Pasaron más de 24 horas: WhatsApp solo deja enviar plantillas.'}
            className="min-h-10 flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-focus disabled:opacity-60"
          />
          <Button type="submit" variant="primary" icon={Send} loading={send.isPending} disabled={!open || !text.trim()}>
            Enviar
          </Button>
        </form>
      )}
    </section>
  )
}
