import { Button } from '@/shared/ui/Button'
import { FormActions, Input } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import clsx from 'clsx'
import { Moon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useKitchenSchedule, useSaveWeeklyHours } from '../../hooks/useKitchenSchedule'
import { dayHoursError, isOvernight, isScheduleConfigured, WEEK_DAY_LABEL, WEEK_DAYS, type DayHours, type KitchenSchedule, type WeekDay } from '../../lib/schedule'
import { timeInputClass } from './timeInputClass'

const CLOSED: DayHours = { isOpen: false, opensAt: null, closesAt: null }
const DEFAULT_OPENS = '11:00'
const DEFAULT_CLOSES = '22:00'

function fullWeek(weekly: KitchenSchedule['weekly']): Record<WeekDay, DayHours> {
  return Object.fromEntries(WEEK_DAYS.map((day) => [day, weekly[day] ?? CLOSED])) as Record<WeekDay, DayHours>
}

/**
 * Plantilla semanal: el horario que se repite todas las semanas. Se guarda
 * completa (los 7 días) para que nunca quede un día "a medias".
 */
export function WeeklyHoursPanel({ canEdit }: { canEdit: boolean }) {
  const { data: schedule } = useKitchenSchedule()
  const save = useSaveWeeklyHours()
  const { show } = useToast()

  // Derivado de lo guardado mientras no haya edición local (mismo patrón que el form de SLA).
  const [edited, setEdited] = useState<Record<WeekDay, DayHours> | null>(null)
  const form = edited ?? fullWeek(schedule?.weekly ?? {})
  const configured = schedule ? isScheduleConfigured(schedule) : true
  const hasErrors = WEEK_DAYS.some((day) => dayHoursError(form[day]))

  function setDay(day: WeekDay, patch: Partial<DayHours>) {
    setEdited({ ...form, [day]: { ...form[day], ...patch } })
  }

  function toggleDay(day: WeekDay, isOpen: boolean) {
    if (!isOpen) return setDay(day, { isOpen })
    // Al abrir un día sin horas, copia las del día abierto más cercano anterior — lo habitual es repetir el mismo turno.
    const index = WEEK_DAYS.indexOf(day)
    const template = [...WEEK_DAYS.slice(0, index)].reverse().map((d) => form[d]).find((h) => h.isOpen && h.opensAt && h.closesAt)
    setDay(day, {
      isOpen,
      opensAt: form[day].opensAt ?? template?.opensAt ?? DEFAULT_OPENS,
      closesAt: form[day].closesAt ?? template?.closesAt ?? DEFAULT_CLOSES,
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (hasErrors) return
    try {
      await save.mutateAsync(form)
      show('Horario semanal guardado.')
      setEdited(null)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar el horario'), 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className={typography.small}>
        El horario que se repite cada semana. Para festivos o días especiales usa <span className="text-neutral-200">Calendario</span>.
      </p>

      {!configured && (
        <p className="rounded-xl border border-neutral-800/60 bg-neutral-900/60 px-4 py-3 text-xs text-neutral-400">
          Todavía no hay horario. Mientras tanto, Cocina muestra «En vivo» sin indicar si está abierta o cerrada.
        </p>
      )}

      <ul className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800/60">
        {WEEK_DAYS.map((day) => {
          const hours = form[day]
          const error = dayHoursError(hours)
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex w-36 items-center gap-3">
                <Switch checked={hours.isOpen} onChange={(v) => toggleDay(day, v)} label={`${WEEK_DAY_LABEL[day]} abierto`} disabled={!canEdit} />
                <span className={clsx('text-sm font-medium', hours.isOpen ? 'text-neutral-100' : 'text-neutral-500')}>{WEEK_DAY_LABEL[day]}</span>
              </div>

              {hours.isOpen ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="time"
                    aria-label={`${WEEK_DAY_LABEL[day]}: abre`}
                    value={hours.opensAt ?? ''}
                    onChange={(e) => setDay(day, { opensAt: e.target.value || null })}
                    disabled={!canEdit}
                    aria-invalid={!!error || undefined}
                    className={timeInputClass}
                  />
                  <span className="text-xs text-neutral-500">a</span>
                  <Input
                    type="time"
                    aria-label={`${WEEK_DAY_LABEL[day]}: cierra`}
                    value={hours.closesAt ?? ''}
                    onChange={(e) => setDay(day, { closesAt: e.target.value || null })}
                    disabled={!canEdit}
                    aria-invalid={!!error || undefined}
                    className={timeInputClass}
                  />
                  {isOvernight(hours) && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
                      <Moon size={11} aria-hidden /> cierra al día siguiente
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-neutral-600">Cerrado</span>
              )}

              {error && (
                <p role="alert" className="w-full text-xs text-red-400">
                  {error}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {canEdit ? (
        <FormActions>
          {edited && (
            <Button variant="ghost" onClick={() => setEdited(null)} disabled={save.isPending}>
              Descartar cambios
            </Button>
          )}
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!edited || hasErrors}>
            Guardar horario
          </Button>
        </FormActions>
      ) : (
        <p className={typography.caption}>Solo un administrador o gerente puede cambiar el horario.</p>
      )}
    </form>
  )
}
