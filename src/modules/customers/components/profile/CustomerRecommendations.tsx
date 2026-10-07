import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Combobox } from '@/shared/ui/Combobox'
import { FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { Lightbulb, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useCreateRecommendation, usePreferenceOptions, useSetRecommendationStatus } from '../../hooks/useCustomerProfile'
import type { CustomerRecommendation } from '../../types'

function AddRecommendation({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const create = useCreateRecommendation(customerId)
  const options = usePreferenceOptions()
  const { show } = useToast()
  const [title, setTitle] = useState('')
  const [productId, setProductId] = useState('')
  const [reason, setReason] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (title.trim().length < 2) return
    try {
      await create.mutateAsync({ customerId, title, productId: productId || null, reason })
      onDone()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar la recomendación'), 'error')
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3" noValidate>
      <FormField label="Recomendación" required>
        {(a11y) => <Input {...a11y} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus placeholder="Ofrecerle el combo de la semana" />}
      </FormField>
      <FormField label="Plato" info="Opcional: el plato que se le recomienda.">
        {(a11y) => (
          <Combobox {...a11y} value={productId} onChange={setProductId} options={(options.data?.dishes ?? []).map((d) => ({ value: d.id, label: d.name }))} placeholder="Buscar plato…" emptyMessage="Sin platos con ese nombre" />
        )}
      </FormField>
      <FormField label="Por qué">
        {(a11y) => <Input {...a11y} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Siempre pide hamburguesa los viernes" />}
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={create.isPending}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={create.isPending} disabled={title.trim().length < 2}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

/**
 * Recomendaciones (ADR 0040): what to offer this customer. Today they are
 * written by the team («Manual»); the structure is ready for a recommender
 * that writes «Automática» ones from orders, favourites and preferences.
 */
export function CustomerRecommendations({ customerId, recommendations, canEdit }: { customerId: string; recommendations: CustomerRecommendation[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)
  const setStatus = useSetRecommendationStatus(customerId)
  const active = recommendations.filter((r) => r.status === 'active')
  const dismissed = recommendations.filter((r) => r.status === 'dismissed')

  const item = (r: CustomerRecommendation) => (
    <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-100">
          {r.title}
          <Badge size="sm" tone={r.source === 'auto' ? 'violet' : 'neutral'} icon={r.source === 'auto' ? Sparkles : undefined}>
            {r.source === 'auto' ? 'Automática' : 'Manual'}
          </Badge>
        </span>
        {(r.productName || r.reason) && <span className="block text-xs text-neutral-400">{[r.productName, r.reason].filter(Boolean).join(' · ')}</span>}
      </span>
      {canEdit && (
        <Button
          variant="ghost"
          size="sm"
          icon={r.status === 'active' ? X : RotateCcw}
          onClick={() => setStatus.mutate({ id: r.id, status: r.status === 'active' ? 'dismissed' : 'active' })}
          aria-label={r.status === 'active' ? `Descartar «${r.title}»` : `Volver a activar «${r.title}»`}
        />
      )}
    </li>
  )

  return (
    <Card
      title="Recomendaciones"
      icon={Lightbulb}
      action={
        canEdit &&
        !adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
            <Plus size={12} aria-hidden /> Agregar
          </button>
        )
      }
    >
      <div className="space-y-3">
        {adding && <AddRecommendation customerId={customerId} onDone={() => setAdding(false)} />}
        {active.length === 0 && !adding ? (
          <p className="text-sm text-neutral-500">Sin recomendaciones. Anota qué ofrecerle según lo que pide y le gusta.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60">{active.map(item)}</ul>
        )}
        {dismissed.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowDismissed((v) => !v)} className="text-xs text-neutral-500 hover:text-neutral-300">
              {showDismissed ? 'Ocultar' : 'Ver'} descartadas ({dismissed.length})
            </button>
            {showDismissed && <ul className="divide-y divide-neutral-800/60 opacity-70">{dismissed.map(item)}</ul>}
          </div>
        )}
      </div>
    </Card>
  )
}
