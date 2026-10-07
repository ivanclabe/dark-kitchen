import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Drawer } from '@/shared/ui/Drawer'
import { FormActions, FormField, Input, Textarea } from '@/shared/ui/FormField'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate } from '@/shared/utils/format'
import clsx from 'clsx'
import { Archive, ArchiveRestore, MapPin, Navigation, Pencil, Plus, Star } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useArchiveAddress, useSaveAddress } from '../../hooks/useCustomerProfile'
import type { CustomerAddress } from '../../types'

function AddressDrawer({ customerId, editing, onClose }: { customerId: string; editing: CustomerAddress | null; onClose: () => void }) {
  const save = useSaveAddress(customerId)
  const { show } = useToast()
  const [address, setAddress] = useState(editing?.address ?? '')
  const [reference, setReference] = useState(editing?.reference ?? '')
  const [recipient, setRecipient] = useState(editing?.recipientName ?? '')
  const [notes, setNotes] = useState(editing?.deliveryNotes ?? '')
  const [frequent, setFrequent] = useState(editing?.isFrequent ?? false)
  const [makeCurrent, setMakeCurrent] = useState(editing ? editing.isCurrent : true)
  const [error, setError] = useState<string | null>(null)
  const changesText = editing !== null && address.trim() !== editing.address

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (address.trim().length < 3) return setError('Escribe la dirección.')
    try {
      await save.mutateAsync({ customerId, id: editing?.id ?? null, address, reference, recipientName: recipient, deliveryNotes: notes, isFrequent: frequent, makeCurrent })
      show(editing && !changesText ? 'Dirección actualizada.' : 'Dirección guardada.')
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la dirección'))
    }
  }

  return (
    <Drawer open onClose={onClose} title={editing ? 'Editar dirección' : 'Nueva dirección'} size="sm">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <FormField label="Dirección" required error={error} hint={changesText ? 'Cambiar el texto guarda una dirección nueva; la anterior queda en el historial.' : undefined}>
          {(a11y) => <Input {...a11y} value={address} onChange={(e) => { setAddress(e.target.value); setError(null) }} maxLength={300} autoFocus autoComplete="street-address" placeholder="Calle 10 # 20-30, barrio" />}
        </FormField>
        <FormField label="Referencia" info="Lo que ayuda a encontrarla: torre, apartamento, color de la puerta, un lugar conocido cerca.">
          {(a11y) => <Input {...a11y} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} placeholder="Torre 3, apto 501" />}
        </FormField>
        <FormField label="Quién recibe" info="Si no es el cliente: por ejemplo, la portería o un familiar.">
          {(a11y) => <Input {...a11y} value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={120} autoComplete="name" />}
        </FormField>
        <FormField label="Indicaciones para la entrega">
          {(a11y) => <Textarea {...a11y} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Llamar al llegar; no timbrar después de las 9 p. m." />}
        </FormField>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={frequent} onChange={(e) => setFrequent(e.target.checked)} className="size-4 rounded border-neutral-700 bg-neutral-900 text-brasa-500" />
          Dirección frecuente
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} disabled={editing?.isCurrent} className="mt-0.5 size-4 rounded border-neutral-700 bg-neutral-900 text-brasa-500" />
          <span>
            Usar como última dirección de envío
            <span className={`block ${typography.caption}`}>Es la que verán los pedidos y el despacho.</span>
          </span>
        </label>
        <FormActions>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Guardar
          </Button>
        </FormActions>
      </form>
    </Drawer>
  )
}

function AddressBody({ a }: { a: CustomerAddress }) {
  const details = [a.reference, a.recipientName ? `Recibe: ${a.recipientName}` : null].filter(Boolean).join(' · ')
  return (
    <span className="min-w-0">
      <span className="block text-sm font-medium break-words text-neutral-100">{a.address}</span>
      {details && <span className="block text-xs text-neutral-400">{details}</span>}
      {a.deliveryNotes && <span className="mt-0.5 block text-xs text-neutral-500 italic">{a.deliveryNotes}</span>}
    </span>
  )
}

/**
 * Direcciones (ADR 0040): the last delivery address first (the one orders and
 * dispatch use), then the frequent ones and the earlier ones. Nothing is
 * overwritten: a new address is a new entry, and archiving keeps it.
 * `compact`: only the last delivery address (the summary).
 */
export function CustomerAddresses({ customerId, addresses, canEdit, compact = false }: { customerId: string; addresses: CustomerAddress[]; canEdit: boolean; compact?: boolean }) {
  const [drawer, setDrawer] = useState<{ editing: CustomerAddress | null } | null>(null)
  const [archiving, setArchiving] = useState<CustomerAddress | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const save = useSaveAddress(customerId)
  const archive = useArchiveAddress(customerId)
  const { show } = useToast()

  const current = addresses.find((a) => a.isCurrent && !a.archivedAt) ?? null
  const others = addresses.filter((a) => a !== current && !a.archivedAt)
  const frequent = others.filter((a) => a.isFrequent)
  const earlier = others.filter((a) => !a.isFrequent)
  const archived = addresses.filter((a) => a.archivedAt)

  function setAsCurrent(a: CustomerAddress) {
    save.mutate(
      { customerId, id: a.id, address: a.address, reference: a.reference, recipientName: a.recipientName, deliveryNotes: a.deliveryNotes, isFrequent: a.isFrequent, makeCurrent: true },
      { onSuccess: () => show('Ahora es la última dirección de envío.'), onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar'), 'error') },
    )
  }

  const currentCard = (
    <div className={clsx('rounded-xl border p-4', current ? 'border-brasa-500/30 bg-brasa-500/5' : 'border-dashed border-neutral-800')}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2.5">
          <Navigation size={16} className="mt-0.5 shrink-0 text-brasa-400" aria-hidden />
          {current ? <AddressBody a={current} /> : <span className="text-sm text-neutral-500">Sin dirección de envío.</span>}
        </span>
        {current && canEdit && !compact && (
          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setDrawer({ editing: current })}>
            Editar
          </Button>
        )}
      </div>
      {current && (
        <p className={`mt-2 ${typography.caption}`}>
          Última dirección de envío · usada el {formatDate(current.lastUsedAt)}
          {current.isFrequent && ' · frecuente'}
        </p>
      )}
    </div>
  )

  const row = (a: CustomerAddress) => (
    <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <span className="flex min-w-0 items-start gap-2.5">
        <MapPin size={15} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden />
        <span className="min-w-0">
          <AddressBody a={a} />
          <span className={`block ${typography.caption}`}>{a.archivedAt ? `Archivada el ${formatDate(a.archivedAt)}` : `Usada el ${formatDate(a.lastUsedAt)}`}</span>
        </span>
      </span>
      {canEdit && (
        <span className="flex flex-wrap gap-1">
          {a.archivedAt ? (
            <Button variant="ghost" size="sm" icon={ArchiveRestore} onClick={() => archive.mutate({ id: a.id, archived: false })}>
              Restaurar
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setAsCurrent(a)} loading={save.isPending && save.variables?.id === a.id}>
                Usar como última
              </Button>
              <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setDrawer({ editing: a })} aria-label={`Editar ${a.address}`} />
              <Button variant="ghost" size="sm" icon={Archive} onClick={() => setArchiving(a)} aria-label={`Archivar ${a.address}`} />
            </>
          )}
        </span>
      )}
    </li>
  )

  if (compact) {
    return (
      <Card title="Última dirección de envío" icon={MapPin}>
        {currentCard}
        {others.length > 0 && <p className={`mt-2 ${typography.caption}`}>{others.length} {others.length === 1 ? 'dirección más' : 'direcciones más'} en su historial.</p>}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={typography.h3}>Última dirección de envío</h3>
        {canEdit && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setDrawer({ editing: null })}>
            Nueva dirección
          </Button>
        )}
      </div>
      {currentCard}

      {[
        { title: 'Frecuentes', list: frequent, icon: Star },
        { title: 'Anteriores', list: earlier, icon: MapPin },
      ].map(
        (g) =>
          g.list.length > 0 && (
            <section key={g.title} aria-label={g.title}>
              <h3 className={`mb-2 flex items-center gap-1.5 ${typography.h3}`}>
                <g.icon size={14} className="text-neutral-500" aria-hidden /> {g.title}
              </h3>
              <ul className="divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60">{g.list.map(row)}</ul>
            </section>
          ),
      )}

      {archived.length > 0 && (
        <section aria-label="Archivadas">
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-sm text-neutral-400 hover:text-neutral-200">
            {showArchived ? 'Ocultar' : 'Ver'} archivadas ({archived.length})
          </button>
          {showArchived && <ul className="mt-2 divide-y divide-neutral-800/60 rounded-2xl border border-neutral-800/60 opacity-80">{archived.map(row)}</ul>}
        </section>
      )}

      {addresses.length === 0 && <p className="text-sm text-neutral-500">Sin direcciones guardadas.</p>}

      {drawer && <AddressDrawer key={drawer.editing?.id ?? 'new'} customerId={customerId} editing={drawer.editing} onClose={() => setDrawer(null)} />}
      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() =>
          archiving &&
          archive.mutate(
            { id: archiving.id, archived: true },
            { onSuccess: () => setArchiving(null), onError: (err) => show(getErrorMessage(err, 'No se pudo archivar'), 'error') },
          )
        }
        title="Archivar dirección"
        description={<p>«{archiving?.address}» sale de la lista pero queda en el historial; puedes restaurarla.</p>}
        confirmLabel="Sí, archivar"
        pending={archive.isPending}
      />
    </div>
  )
}
