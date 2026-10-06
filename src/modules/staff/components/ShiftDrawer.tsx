import { Button } from '@/shared/ui/Button'
import { NumberInput } from '@/shared/ui/NumberInput'
import { Drawer } from '@/shared/ui/Drawer'
import { FormActions, FormField, FormGrid, Input, Select, Textarea } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { toDateInput } from '@/shared/utils/format'
import { XCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { shiftErrorMessage } from '../api/staff'
import { useCancelShift, useCreateShift, useUpdateShift } from '../hooks/useStaff'
import { formatHours, plannedHours, shiftRange, toTimeInput } from '../lib/week'
import type { Shift, StaffMember } from '../types'

export interface ShiftDraft {
  shift?: Shift
  userId?: string
  day?: string
}

/**
 * Create or edit a shift (ADR 0020). Any start and end — an end before the
 * start is the next day, so overnight shifts are typed as they are said
 * ("22:00 a 06:00"). Several shifts the same day make a split shift. The
 * database refuses overlaps of the same person in the whole organization.
 */
export function ShiftDrawer({ draft, members, onClose }: { draft: ShiftDraft; members: StaffMember[]; onClose: () => void }) {
  const { show } = useToast()
  const editing = draft.shift
  const create = useCreateShift()
  const update = useUpdateShift()
  const cancel = useCancelShift()

  const initialUser = editing?.userId ?? draft.userId ?? members.find((m) => m.active)?.userId ?? ''
  const [userId, setUserId] = useState(initialUser)
  const member = members.find((m) => m.userId === userId)
  const [roleId, setRoleId] = useState(editing?.roleId ?? member?.defaultRoleId ?? member?.roles[0]?.id ?? '')
  const [day, setDay] = useState(editing ? toDateInput(new Date(editing.startsAt)) : (draft.day ?? toDateInput(new Date())))
  const [start, setStart] = useState(editing ? toTimeInput(editing.startsAt) : '08:00')
  const [end, setEnd] = useState(editing ? toTimeInput(editing.endsAt) : '16:00')
  const [breakMinutes, setBreakMinutes] = useState<number | null>(editing?.breakMinutes ?? 0)
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const range = start && end && day ? shiftRange(day, start, end) : null
  const hours = range ? plannedHours({ startsAt: range.startsAt.toISOString(), endsAt: range.endsAt.toISOString(), breakMinutes: breakMinutes ?? 0 }) : 0

  function choosePerson(next: string) {
    setUserId(next)
    const m = members.find((x) => x.userId === next)
    if (m && !m.roles.some((r) => r.id === roleId)) setRoleId(m.defaultRoleId ?? m.roles[0]?.id ?? '')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!userId || !roleId || !range) {
      setError('Elige la persona, el rol y el horario.')
      return
    }
    setError(null)
    const input = { userId, roleId, startsAt: range.startsAt.toISOString(), endsAt: range.endsAt.toISOString(), breakMinutes: breakMinutes ?? 0, notes }
    try {
      if (editing) await update.mutateAsync({ id: editing.id, input })
      else await create.mutateAsync(input)
      show(editing ? 'Turno actualizado.' : 'Turno creado.')
      onClose()
    } catch (err) {
      setError(shiftErrorMessage(err) ?? getErrorMessage(err, 'No se pudo guardar el turno'))
    }
  }

  async function cancelShift() {
    if (!editing) return
    try {
      await cancel.mutateAsync(editing.id)
      show('Turno cancelado.', 'info')
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cancelar el turno'))
    }
  }

  const activeMembers = members.filter((m) => m.active || m.userId === userId)

  return (
    <Drawer open onClose={onClose} title={editing ? 'Editar turno' : 'Nuevo turno'} subtitle={member?.fullName} size="md">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <FormGrid cols={2}>
          <FormField label="Persona" required className="sm:col-span-2">
            {(a11y) => (
              <Select {...a11y} value={userId} onChange={(e) => choosePerson(e.target.value)} disabled={!!editing?.clockInAt}>
                {activeMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Rol en este turno" required hint="Uno de los roles de la persona en esta cuenta.">
            {(a11y) => (
              <Select {...a11y} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {(member?.roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Día" required>
            {(a11y) => <Input {...a11y} type="date" value={day} onChange={(e) => setDay(e.target.value)} />}
          </FormField>
          <FormField label="Entra" required>
            {(a11y) => <Input {...a11y} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}
          </FormField>
          <FormField label="Sale" required hint={range && range.endsAt.getDate() !== range.startsAt.getDate() ? 'Termina al día siguiente.' : undefined}>
            {(a11y) => <Input {...a11y} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
          </FormField>
          <FormField label="Descanso" info="Se descuenta de las horas planificadas del turno.">
            {(a11y) => <NumberInput {...a11y} value={breakMinutes} onValueChange={setBreakMinutes} min={0} max={240} unit="min" />}
          </FormField>
          <div className="flex items-end pb-2 text-sm text-neutral-400">{hours > 0 ? `${formatHours(hours)} de trabajo` : ''}</div>
          <FormField label="Nota" className="sm:col-span-2">
            {(a11y) => <Textarea {...a11y} rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. cubre a Laura, abre la cocina" />}
          </FormField>
        </FormGrid>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <FormActions>
          {editing && (
            <Button variant="ghost" icon={XCircle} onClick={() => void cancelShift()} loading={cancel.isPending} className="mr-auto !text-red-400">
              Cancelar turno
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending || update.isPending}>
            {editing ? 'Guardar' : 'Crear turno'}
          </Button>
        </FormActions>
      </form>
    </Drawer>
  )
}
