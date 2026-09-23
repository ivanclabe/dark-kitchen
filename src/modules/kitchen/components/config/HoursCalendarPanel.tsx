import { formatMonthLabel, isSameMonth, monthGridDates } from '@/modules/menuPlanner/lib/week'
import { Button, IconButton } from '@/shared/ui/Button'
import { FormActions, FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { toDateInput, todayStr } from '@/shared/utils/format'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Moon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useDeleteHoursException, useKitchenSchedule, useSaveHoursException } from '../../hooks/useKitchenSchedule'
import { dayHoursError, hoursForDate, isOvernight, type DayHours, type KitchenSchedule } from '../../lib/schedule'
import { timeInputClass } from './timeInputClass'

const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const EMPTY_SCHEDULE: KitchenSchedule = { weekly: {}, exceptions: [] }

type Mode = 'weekly' | 'closed' | 'special'

const MODES: { value: Mode; label: string }[] = [
  { value: 'weekly', label: 'Horario semanal' },
  { value: 'closed', label: 'Cerrado' },
  { value: 'special', label: 'Horario especial' },
]

function shiftMonth(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00`)
  return toDateInput(new Date(d.getFullYear(), d.getMonth() + months, 1))
}

function formatDayTitle(date: string): string {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function shortHours(hours: DayHours): string {
  return hours.isOpen && hours.opensAt && hours.closesAt ? `${hours.opensAt}–${hours.closesAt}` : 'Cerrado'
}

/**
 * Edita un día concreto: seguir la plantilla semanal (= sin excepción),
 * cerrar, o un horario especial. Se monta con `key={date}` para arrancar
 * limpio al cambiar de día.
 */
function DayEditor({ date, schedule, canEdit }: { date: string; schedule: KitchenSchedule; canEdit: boolean }) {
  const exception = schedule.exceptions.find((e) => e.date === date)
  const weeklyHours = hoursForDate({ ...schedule, exceptions: [] }, date)
  const save = useSaveHoursException()
  const remove = useDeleteHoursException()
  const { show } = useToast()

  const [mode, setMode] = useState<Mode>(!exception ? 'weekly' : exception.isOpen ? 'special' : 'closed')
  const [opensAt, setOpensAt] = useState(exception?.opensAt ?? weeklyHours.opensAt ?? '11:00')
  const [closesAt, setClosesAt] = useState(exception?.closesAt ?? weeklyHours.closesAt ?? '22:00')
  const [note, setNote] = useState(exception?.note ?? '')

  const special: DayHours = { isOpen: true, opensAt, closesAt }
  const error = mode === 'special' ? dayHoursError(special) : null
  const pending = save.isPending || remove.isPending

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (error) return
    try {
      if (mode === 'weekly') {
        if (exception) await remove.mutateAsync(date)
        show('El día vuelve a seguir el horario semanal.')
      } else {
        await save.mutateAsync({ date, note, ...(mode === 'special' ? special : { isOpen: false, opensAt: null, closesAt: null }) })
        show('Horario del día guardado.')
      }
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar el día'), 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-neutral-800/60 bg-neutral-900/60 p-4">
      <div>
        <p className={typography.h3}>{formatDayTitle(date)}</p>
        <p className={clsx('mt-0.5', typography.caption)}>Horario semanal de ese día: {shortHours(weeklyHours)}</p>
      </div>

      <div role="radiogroup" aria-label="Horario del día" className="inline-flex flex-wrap gap-1 rounded-full border border-neutral-800/60 bg-neutral-950 p-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            disabled={!canEdit}
            onClick={() => setMode(m.value)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed',
              mode === m.value ? 'bg-brasa-500 text-white' : 'text-neutral-400 hover:text-neutral-200',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'special' && (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="time" aria-label="Abre" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} disabled={!canEdit} className={timeInputClass} />
          <span className="text-xs text-neutral-500">a</span>
          <Input type="time" aria-label="Cierra" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} disabled={!canEdit} className={timeInputClass} />
          {isOvernight(special) && (
            <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
              <Moon size={11} aria-hidden /> cierra al día siguiente
            </span>
          )}
          {error && (
            <p role="alert" className="w-full text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
      )}

      {mode !== 'weekly' && (
        <FormField label="Nota" hint="Se muestra junto al estado de la cocina ese día.">
          {(a11y) => <Input {...a11y} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Festivo, inventario, evento privado" maxLength={80} disabled={!canEdit} />}
        </FormField>
      )}

      {canEdit && (
        <FormActions>
          <Button type="submit" variant="primary" size="sm" loading={pending} disabled={!!error || (mode === 'weekly' && !exception)}>
            Guardar día
          </Button>
        </FormActions>
      )}
    </form>
  )
}

/**
 * Vista mensual del horario: cada día muestra el horario efectivo (plantilla
 * semanal o excepción). Tocar un día permite cerrarlo o darle un horario
 * especial solo a esa fecha.
 */
export function HoursCalendarPanel({ canEdit }: { canEdit: boolean }) {
  const { data: schedule = EMPTY_SCHEDULE } = useKitchenSchedule()
  const today = todayStr()
  const [month, setMonth] = useState(today)
  const [selected, setSelected] = useState<string | null>(null)
  const hasWeekly = Object.keys(schedule.weekly).length > 0

  return (
    <div className="space-y-4">
      <p className={typography.small}>Festivos, cierres o jornadas especiales. Una fecha marcada aquí manda sobre el horario semanal.</p>

      <div className="rounded-xl border border-neutral-800/60">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-800/60 px-3 py-2">
          <IconButton variant="ghost" size="sm" icon={ChevronLeft} aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))} />
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-neutral-100">{formatMonthLabel(month)}</p>
            {!isSameMonth(month, today) && (
              <button type="button" onClick={() => setMonth(today)} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-brasa-400 hover:bg-neutral-800">
                Hoy
              </button>
            )}
          </div>
          <IconButton variant="ghost" size="sm" icon={ChevronRight} aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(month, 1))} />
        </div>

        <div className="grid grid-cols-7 gap-px p-2">
          {WEEKDAY_HEADERS.map((d) => (
            <p key={d} className="pb-1 text-center text-[10px] font-semibold text-neutral-600">
              {d}
            </p>
          ))}
          {monthGridDates(month).map((date) => {
            const hours = hoursForDate(schedule, date)
            const inMonth = isSameMonth(date, month)
            const known = hours.isException || hasWeekly
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                aria-pressed={selected === date}
                aria-label={`${formatDayTitle(date)}: ${known ? shortHours(hours) : 'sin horario'}${hours.isException ? ' (excepción)' : ''}`}
                className={clsx(
                  'flex min-h-14 flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 transition-colors hover:bg-neutral-800/70',
                  !inMonth && 'opacity-35',
                  selected === date && 'bg-neutral-800 ring-1 ring-brasa-500/60',
                  hours.isException && selected !== date && 'bg-brasa-500/[0.07]',
                )}
              >
                <span
                  className={clsx(
                    'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                    date === today ? 'bg-brasa-500 font-semibold text-white' : 'text-neutral-200',
                  )}
                >
                  {Number(date.slice(8))}
                </span>
                {known && (
                  <>
                    <span className={clsx('size-1.5 rounded-full sm:hidden', hours.isOpen ? 'bg-emerald-400' : 'bg-neutral-600')} aria-hidden />
                    <span className={clsx('hidden text-[10px] leading-tight tabular-nums sm:block', hours.isOpen ? 'text-neutral-400' : 'text-neutral-600')}>
                      {hours.isOpen ? `${hours.opensAt}–${hours.closesAt}` : 'Cerrado'}
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-neutral-800/60 px-3 py-2 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-brasa-500/30" aria-hidden /> Excepción
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brasa-500" aria-hidden /> Hoy
          </span>
        </div>
      </div>

      {selected ? (
        <DayEditor key={selected} date={selected} schedule={schedule} canEdit={canEdit} />
      ) : (
        <p className={typography.caption}>Toca un día para {canEdit ? 'cambiar' : 'ver'} su horario.</p>
      )}
    </div>
  )
}
