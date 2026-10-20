import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, Select, Textarea } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { useState } from 'react'
import { PageTitle, Panel, StatusPill } from '../components/ui'
import { fetchPqrRequests, updatePqrRequest, type PqrRow } from '../lib/api'
import { formatShortDate } from '../lib/format'

const KIND: Record<string, string> = {
  consulta: 'Consulta de datos',
  reclamo: 'Reclamo de datos',
  rectificacion: 'Corregir datos',
  supresion: 'Eliminar datos',
  revocatoria: 'Revocar autorización',
  reembolso: 'Reembolso',
  retracto: 'Retracto',
  queja: 'Petición o queja',
}

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' | 'brand' }> = {
  radicada: { label: 'Radicada', tone: 'brand' },
  en_tramite: { label: 'En trámite', tone: 'warn' },
  incompleta: { label: 'Falta información', tone: 'warn' },
  respondida: { label: 'Respondida', tone: 'good' },
  cerrada: { label: 'Cerrada', tone: 'neutral' },
}

const isOpen = (r: PqrRow) => r.status !== 'respondida' && r.status !== 'cerrada'
const dueOf = (r: PqrRow) => r.extended_due_date ?? r.due_date
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

function RequestDrawer({ request, onClose }: { request: PqrRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [status, setStatus] = useState(request.status === 'radicada' ? 'en_tramite' : request.status)
  const [message, setMessage] = useState('')
  const update = useMutation({
    mutationFn: (extend: boolean) => updatePqrRequest({ id: request.id, status, message: message.trim() || undefined, extend }),
    onSuccess: async () => {
      show('Solicitud actualizada.', 'success')
      setMessage('')
      await queryClient.invalidateQueries({ queryKey: ['ga', 'pqr'] })
      onClose()
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo actualizar la solicitud'), 'error'),
  })
  const details = request.details as { firstPaymentAt?: string | null; withdrawalDeadline?: string | null } | null

  return (
    <Drawer open onClose={onClose} title={`${request.radicado} · ${KIND[request.kind] ?? request.kind}`}>
      <div className="space-y-5 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-neutral-500">Quién</dt>
          <dd className="text-neutral-200">{request.requester_email ?? '—'}</dd>
          <dt className="text-neutral-500">Negocio</dt>
          <dd className="text-neutral-200">{request.organization_name ?? '—'}</dd>
          <dt className="text-neutral-500">Radicada</dt>
          <dd className="text-neutral-200">{formatShortDate(request.created_at)}</dd>
          <dt className="text-neutral-500">Vence</dt>
          <dd className="text-neutral-200">
            {dueOf(request)} {request.extended_due_date && '(prorrogado)'} · {request.legal_basis}
          </dd>
          {request.kind === 'retracto' && (
            <>
              <dt className="text-neutral-500">Primer pago</dt>
              <dd className="text-neutral-200">
                {details?.firstPaymentAt ? `${formatShortDate(details.firstPaymentAt)} · retracto hasta ${details.withdrawalDeadline}` : 'Sin pagos aprobados'}
              </dd>
            </>
          )}
        </dl>
        <p className="rounded-xl border border-console-700 bg-console-900 p-3 whitespace-pre-line text-neutral-200">{request.description}</p>
        {request.response && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-xs text-emerald-400">Respuesta enviada</p>
            <p className="mt-1 whitespace-pre-line text-neutral-200">{request.response}</p>
          </div>
        )}
        <FormField label="Estado">
          {(a11y) => (
            <Select {...a11y} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="en_tramite">En trámite</option>
              <option value="incompleta">Falta información</option>
              <option value="respondida">Respondida</option>
              <option value="cerrada">Cerrada</option>
            </Select>
          )}
        </FormField>
        <FormField label="Respuesta o nota" hint="La respuesta la ve la persona en «Privacidad y datos». Para prorrogar, escribe el motivo.">
          {(a11y) => <Textarea {...a11y} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={8000} />}
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={update.isPending} onClick={() => update.mutate(false)} disabled={status === 'respondida' && !message.trim()}>
            Guardar
          </Button>
          {!request.extended_due_date && isOpen(request) && (
            <Button variant="ghost" onClick={() => update.mutate(true)} disabled={!message.trim() || update.isPending}>
              Prorrogar plazo
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  )
}

/** PQR of Quanela (ADR 0071): data-protection requests, refunds and complaints, each with its legal term. */
export function RequestsPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['ga', 'pqr'], queryFn: fetchPqrRequests })
  const [selected, setSelected] = useState<PqrRow | null>(null)
  const open = (data ?? []).filter(isOpen)
  const overdue = open.filter((r) => dueOf(r) < today())

  return (
    <div className="space-y-6">
      <PageTitle
        title="Solicitudes (PQR)"
        icon={Inbox}
        description={`${open.length} abiertas${overdue.length ? ` · ${overdue.length} vencidas` : ''}. Consultas: 10 días hábiles; reclamos, reembolsos y quejas: 15.`}
      />
      <Panel>
        {isLoading ? (
          <LoadingState variant="block" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} compact />
        ) : !data?.length ? (
          <p className="py-6 text-center text-sm text-neutral-400">No hay solicitudes.</p>
        ) : (
          <ul className="divide-y divide-console-800">
            {data.map((r) => {
              const late = isOpen(r) && dueOf(r) < today()
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-1 py-3 text-left hover:bg-console-900">
                    <span className="font-mono text-sm text-neutral-100">{r.radicado}</span>
                    <StatusPill tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</StatusPill>
                    <span className="text-sm text-neutral-300">{KIND[r.kind] ?? r.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-500">{r.organization_name ?? r.requester_email}</span>
                    <span className={late ? 'text-xs font-medium text-red-300' : 'text-xs text-neutral-500'}>
                      {isOpen(r) ? `${late ? 'Venció' : 'Vence'} ${dueOf(r)}` : `Respondida ${r.answered_at ? formatShortDate(r.answered_at) : ''}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      {selected && <RequestDrawer request={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
