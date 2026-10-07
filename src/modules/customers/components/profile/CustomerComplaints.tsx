import { useOrderSearch } from '@/modules/orders/hooks/useOrders'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Drawer } from '@/shared/ui/Drawer'
import { FormActions, FormField, Select, Textarea } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate, formatDateTime } from '@/shared/utils/format'
import { CheckCircle2, MessageSquareWarning, NotebookPen, Plus, ReceiptText } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useCreateComplaint, useUpdateComplaint } from '../../hooks/useCustomerProfile'
import { COMPLAINT_CATEGORY_LABEL, COMPLAINT_STATUS, openComplaints } from '../../lib/profile'
import type { ComplaintCategory, ComplaintStatus, CustomerComplaint } from '../../types'

const STATUSES = Object.keys(COMPLAINT_STATUS) as ComplaintStatus[]
const CATEGORIES = Object.keys(COMPLAINT_CATEGORY_LABEL) as ComplaintCategory[]

/** Registrar una queja: what happened, about which order (optional), and how it stands. */
export function NewComplaintDrawer({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const create = useCreateComplaint(customerId)
  const orders = useOrderSearch({ customerId, limit: 20, offset: 0 })
  const { show } = useToast()
  const [category, setCategory] = useState<ComplaintCategory>('quality')
  const [orderId, setOrderId] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ComplaintStatus>('pending')
  const [resolution, setResolution] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (description.trim().length < 3) return setError('Cuenta qué pasó.')
    try {
      await create.mutateAsync({ customerId, orderId: orderId || null, category, description, status, resolution, internalNotes })
      show('Queja registrada.')
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar la queja'))
    }
  }

  return (
    <Drawer open onClose={onClose} title="Registrar queja" size="sm">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <FormField label="Motivo" required>
          {(a11y) => (
            <Select {...a11y} value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COMPLAINT_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Pedido" info="Opcional: el pedido del que se queja, para revisarlo después.">
          {(a11y) => (
            <Select {...a11y} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Sin pedido</option>
              {orders.data?.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.orderNumber} · {formatDate(o.createdAt)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Qué pasó" required error={error}>
          {(a11y) => <Textarea {...a11y} rows={4} maxLength={2000} value={description} onChange={(e) => { setDescription(e.target.value); setError(null) }} autoFocus placeholder="Con las palabras del cliente." />}
        </FormField>
        <FormField label="Estado">
          {(a11y) => (
            <Select {...a11y} value={status} onChange={(e) => setStatus(e.target.value as ComplaintStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMPLAINT_STATUS[s].label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {status === 'resolved' && (
          <FormField label="Respuesta o solución" info="Lo que se le respondió o se hizo (un descuento, reponer el plato…).">
            {(a11y) => <Textarea {...a11y} rows={2} maxLength={2000} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
          </FormField>
        )}
        <FormField label="Notas internas" info="Solo para el equipo; el cliente no las ve.">
          {(a11y) => <Textarea {...a11y} rows={2} maxLength={2000} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />}
        </FormField>
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Registrar
          </Button>
        </FormActions>
      </form>
    </Drawer>
  )
}

/** Seguimiento: the status, the answer and internal notes. What was reported stays as it was. */
function FollowUpDrawer({ customerId, complaint, onClose }: { customerId: string; complaint: CustomerComplaint; onClose: () => void }) {
  const update = useUpdateComplaint(customerId)
  const { show } = useToast()
  const [status, setStatus] = useState<ComplaintStatus>(complaint.status)
  const [resolution, setResolution] = useState(complaint.resolution ?? '')
  const [internalNotes, setInternalNotes] = useState(complaint.internalNotes ?? '')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (status === 'resolved' && !resolution.trim()) return setError('Escribe la respuesta o solución para cerrarla.')
    try {
      await update.mutateAsync({ id: complaint.id, status, resolution, internalNotes })
      show(status === 'resolved' ? 'Queja resuelta.' : 'Queja actualizada.')
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo actualizar la queja'))
    }
  }

  return (
    <Drawer open onClose={onClose} title="Seguimiento de la queja" subtitle={`${COMPLAINT_CATEGORY_LABEL[complaint.category]} · ${formatDateTime(complaint.createdAt)}`} size="sm">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3">
          <p className={typography.label}>Lo que reportó</p>
          <p className="mt-1 text-sm whitespace-pre-line text-neutral-200">{complaint.description}</p>
        </div>
        <FormField label="Estado">
          {(a11y) => (
            <Select {...a11y} value={status} onChange={(e) => { setStatus(e.target.value as ComplaintStatus); setError(null) }}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMPLAINT_STATUS[s].label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Respuesta o solución" error={error} info="Lo que se le respondió o se hizo. Al marcarla «Resuelta» se guarda la fecha y quién la cerró.">
          {(a11y) => <Textarea {...a11y} rows={3} maxLength={2000} value={resolution} onChange={(e) => { setResolution(e.target.value); setError(null) }} />}
        </FormField>
        <FormField label="Notas internas" info="Solo para el equipo.">
          {(a11y) => <Textarea {...a11y} rows={2} maxLength={2000} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />}
        </FormField>
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={update.isPending}>
            Guardar
          </Button>
        </FormActions>
      </form>
    </Drawer>
  )
}

function ComplaintItem({ c, onFollowUp, onOpenOrder }: { c: CustomerComplaint; onFollowUp?: () => void; onOpenOrder: (orderId: string) => void }) {
  const status = COMPLAINT_STATUS[c.status]
  return (
    <li className="space-y-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone} size="sm" dot>
            {status.label}
          </Badge>
          <span className="text-sm font-medium text-neutral-100">{COMPLAINT_CATEGORY_LABEL[c.category]}</span>
          {c.orderId && c.orderNumber !== null && (
            <button type="button" onClick={() => onOpenOrder(c.orderId!)} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100 hover:underline">
              <ReceiptText size={12} aria-hidden /> Pedido #{c.orderNumber}
            </button>
          )}
        </span>
        <span className={typography.caption}>
          {formatDateTime(c.createdAt)}
          {c.createdBy ? ` · ${c.createdBy}` : ''}
        </span>
      </div>
      <p className="text-sm whitespace-pre-line text-neutral-200">{c.description}</p>
      {c.resolution && (
        <p className="flex items-start gap-1.5 rounded-lg bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {c.resolution}
            {c.resolvedAt && (
              <span className="block text-xs text-emerald-300/70">
                Resuelta el {formatDate(c.resolvedAt)}
                {c.resolvedBy ? ` por ${c.resolvedBy}` : ''}
              </span>
            )}
          </span>
        </p>
      )}
      {c.internalNotes && (
        <p className="flex items-start gap-1.5 text-xs text-neutral-400">
          <NotebookPen size={12} className="mt-0.5 shrink-0" aria-hidden /> {c.internalNotes}
        </p>
      )}
      {onFollowUp && (
        <Button variant="link" size="sm" onClick={onFollowUp}>
          {c.status === 'resolved' ? 'Ver o reabrir' : 'Dar seguimiento'}
        </Button>
      )}
    </li>
  )
}

/**
 * Quejas e incidencias (ADR 0040): the customer's history, the open ones
 * first. Each one is its own record — nothing is overwritten or deleted.
 * `compact`: only the open ones (the summary).
 */
export function CustomerComplaints({
  customerId,
  complaints,
  canEdit,
  onOpenOrder,
  onNew,
  compact = false,
}: {
  customerId: string
  complaints: CustomerComplaint[]
  canEdit: boolean
  onOpenOrder: (orderId: string) => void
  onNew?: () => void
  compact?: boolean
}) {
  const [following, setFollowing] = useState<CustomerComplaint | null>(null)
  const open = openComplaints(complaints)
  const list = compact ? open.slice(0, 3) : complaints

  const body =
    list.length === 0 ? (
      <p className="text-sm text-neutral-500">{compact ? (complaints.length ? 'Ninguna abierta: todas resueltas.' : 'Sin quejas.') : 'Este cliente no tiene quejas registradas.'}</p>
    ) : (
      <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60">
        {list.map((c) => (
          <ComplaintItem key={c.id} c={c} onOpenOrder={onOpenOrder} onFollowUp={canEdit ? () => setFollowing(c) : undefined} />
        ))}
      </ul>
    )

  return (
    <>
      {compact ? (
        <Card title={`Quejas abiertas${open.length ? ` (${open.length})` : ''}`} icon={MessageSquareWarning}>
          {body}
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={typography.small}>
              {complaints.length} {complaints.length === 1 ? 'registro' : 'registros'} · {open.length} {open.length === 1 ? 'abierta' : 'abiertas'}
            </p>
            {canEdit && onNew && (
              <Button variant="secondary" size="sm" icon={Plus} onClick={onNew}>
                Registrar queja
              </Button>
            )}
          </div>
          {body}
        </div>
      )}
      {following && <FollowUpDrawer key={following.id} customerId={customerId} complaint={following} onClose={() => setFollowing(null)} />}
    </>
  )
}
