import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import { History, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useWaActions, useWaLog } from '../hooks'
import { eventLabel, OUTBOX_STATUS, prettyPhone } from '../lib/whatsapp'
import type { OutboxStatus } from '../types'

const FILTERS: { value: OutboxStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'read', label: 'Leídos' },
  { value: 'failed', label: 'Fallidos' },
  { value: 'skipped', label: 'No enviados' },
  { value: 'queued', label: 'En cola' },
]

/** Registro (ADR 0055): every notice, its status from Meta (sent → delivered → read) and why one failed or was not sent. */
export function LogTab({ canManage }: { canManage: boolean }) {
  const { show } = useToast()
  const [filter, setFilter] = useState<OutboxStatus | 'all'>('all')
  const log = useWaLog(filter)
  const { retry } = useWaActions()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar avisos">
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} active={filter === f.value} onClick={() => setFilter(f.value)} />
        ))}
      </div>
      {log.isError ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : log.isLoading ? (
        <LoadingState variant="block" label="Cargando…" />
      ) : !log.data?.length ? (
        <EmptyState icon={History} title="Aún no hay avisos" description="Cuando un pedido cambie de estado y el cliente haya aceptado recibir avisos, aparecerá aquí." />
      ) : (
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {log.data.map((m) => {
            const status = OUTBOX_STATUS[m.status]
            return (
              <li key={m.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-[9rem] flex-1">
                  <p className="text-neutral-100">
                    {eventLabel(m.event)}
                    {m.order && <span className="text-neutral-400"> · pedido #{m.order.order_number}</span>}
                    {m.payload.test && <span className="text-neutral-400"> · prueba</span>}
                  </p>
                  <p className="text-xs text-neutral-500 tabular-nums">
                    {m.kind === 'webhook' ? 'n8n' : prettyPhone(m.recipient)} · {formatDateTime(m.created_at)}
                    {m.read_at ? ` · leído ${formatDateTime(m.read_at)}` : m.delivered_at ? ` · entregado ${formatDateTime(m.delivered_at)}` : ''}
                    {m.status === 'queued' && m.attempts > 0 ? ` · reintento ${m.attempts + 1} a las ${formatDateTime(m.next_attempt_at)}` : ''}
                  </p>
                  {m.last_error && <p className="mt-0.5 text-xs text-red-400">{m.last_error}</p>}
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
                {canManage && m.status === 'failed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={RotateCcw}
                    loading={retry.isPending && retry.variables === m.id}
                    onClick={() => void retry.mutateAsync(m.id).then(() => show('Aviso en cola de nuevo.'), (err) => show(getErrorMessage(err, 'No se pudo reintentar'), 'error'))}
                  >
                    Reintentar
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
