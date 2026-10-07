import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Textarea } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { NotebookPen, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useUpdateNotes } from '../../hooks/useCustomerProfile'

/** Nota general (ADR 0040): the customer's own note (dk_customers.notes), edited in place. */
export function CustomerNotes({ customerId, notes, canEdit }: { customerId: string; notes: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(notes ?? '')
  const save = useUpdateNotes(customerId)
  const { show } = useToast()

  async function submit() {
    try {
      await save.mutateAsync(draft)
      setEditing(false)
      show('Nota guardada.')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar la nota'), 'error')
    }
  }

  return (
    <Card
      title="Nota general"
      icon={NotebookPen}
      action={
        canEdit &&
        !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(notes ?? '')
              setEditing(true)
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Pencil size={12} aria-hidden /> {notes ? 'Editar' : 'Agregar'}
          </button>
        )
      }
    >
      {editing ? (
        <div className="space-y-2">
          <Textarea aria-label="Nota general del cliente" rows={4} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus className="!mt-0" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={() => void submit()} loading={save.isPending}>
              Guardar
            </Button>
          </div>
        </div>
      ) : notes?.trim() ? (
        <p className="text-sm whitespace-pre-line text-neutral-200">{notes}</p>
      ) : (
        <p className="text-sm text-neutral-500">Sin notas. Úsala para lo que el equipo debe saber de este cliente.</p>
      )}
    </Card>
  )
}
