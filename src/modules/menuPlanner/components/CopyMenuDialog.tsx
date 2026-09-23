import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { FormField, Input } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState } from 'react'
import { useCopyMenuPlanRange } from '../hooks/useMenuPlan'
import { addDays, startOfWeek } from '../lib/week'

/** Copiar un día puntual o una semana completa — siempre reemplaza el destino, nunca crea platos/recetas nuevas. */
export function CopyMenuDialog({
  open,
  onClose,
  defaultDate,
  onCopied,
}: {
  open: boolean
  onClose: () => void
  defaultDate: string
  onCopied: (targetDate: string) => void
}) {
  const [mode, setMode] = useState<'day' | 'week'>('week')
  const [fromDate, setFromDate] = useState(defaultDate)
  const [toDate, setToDate] = useState(addDays(defaultDate, 7))
  const copyRange = useCopyMenuPlanRange()
  const { show } = useToast()

  async function handleCopy() {
    const days = mode === 'week' ? 7 : 1
    const from = mode === 'week' ? startOfWeek(fromDate) : fromDate
    const to = mode === 'week' ? startOfWeek(toDate) : toDate
    try {
      await copyRange.mutateAsync({ fromDate: from, toDate: to, days })
      show(mode === 'week' ? 'Semana copiada.' : 'Día copiado.')
      onCopied(to)
      onClose()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo copiar la planificación'), 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Copiar planificación"
      description="Reemplaza por completo lo que haya en el destino. No crea platos ni recetas nuevas — solo clona la asignación al calendario."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={copyRange.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void handleCopy()} loading={copyRange.isPending}>
            Copiar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Chip label="Una semana completa" active={mode === 'week'} onClick={() => setMode('week')} />
          <Chip label="Un día puntual" active={mode === 'day'} onClick={() => setMode('day')} />
        </div>
        <FormField label={mode === 'week' ? 'Semana de origen (cualquier día de esa semana)' : 'Día de origen'}>
          {(a11y) => <Input {...a11y} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />}
        </FormField>
        <FormField label={mode === 'week' ? 'Semana de destino (cualquier día de esa semana)' : 'Día de destino'}>
          {(a11y) => <Input {...a11y} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />}
        </FormField>
      </div>
    </Modal>
  )
}
