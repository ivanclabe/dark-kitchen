import { hoursForDate, type KitchenSchedule } from '@/modules/kitchen/lib/schedule'
import { toDateInput } from '@/shared/utils/format'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { formatHours, formatShiftRange, groupByPersonDay, isLate, plannedHours, weekDays } from '../lib/week'
import type { Shift, StaffMember } from '../types'
import type { ShiftDraft } from '../components/ShiftDrawer'

const DAY_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function ShiftChip({ shift, roleName, now, onClick, editable }: { shift: Shift; roleName: string; now: number; onClick: () => void; editable: boolean }) {
  const late = isLate(shift, now) && new Date(shift.endsAt).getTime() > now
  const working = shift.clockInAt && !shift.clockOutAt
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable}
      title={shift.notes ?? undefined}
      className={clsx(
        'w-full rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-colors',
        working ? 'border-emerald-500/40 bg-emerald-500/10' : late ? 'border-red-500/40 bg-red-500/10' : 'border-neutral-700 bg-neutral-800/70',
        editable ? 'hover:border-brasa-500/60' : 'cursor-default',
      )}
    >
      <span className="block font-medium tabular-nums text-neutral-100">{formatShiftRange(shift)}</span>
      <span className="block truncate text-neutral-400">
        {roleName}
        {shift.unplanned && ' · sin programar'}
      </span>
    </button>
  )
}

/**
 * Personal → Semana: people × days. Tap an empty day to add a shift, a shift
 * to edit it. Opening hours of the account head each day; the last column
 * adds up the planned hours of each person.
 */
export function WeekView({
  weekStart,
  members,
  shifts,
  schedule,
  roleFilter,
  canManage,
  now,
  onDraft,
}: {
  weekStart: Date
  members: StaffMember[]
  shifts: Shift[]
  schedule: KitchenSchedule | undefined
  roleFilter: string
  canManage: boolean
  now: number
  onDraft: (draft: ShiftDraft) => void
}) {
  const days = weekDays(weekStart)
  const grid = useMemo(() => groupByPersonDay(shifts, weekStart), [shifts, weekStart])
  const roleName = useMemo(() => {
    const names = new Map<string, string>()
    for (const m of members) for (const r of m.roles) names.set(r.id, r.name)
    return names
  }, [members])

  const people = members.filter((m) => {
    const hasShifts = grid.has(m.userId)
    if (!m.active && !hasShifts) return false
    if (!roleFilter) return true
    return m.roles.some((r) => r.id === roleFilter) || (grid.get(m.userId) ?? []).some((d) => d.some((s) => s.roleId === roleFilter))
  })

  const today = toDateInput(new Date(now))

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800/60">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-800/60 bg-neutral-900/60">
            <th className="sticky left-0 z-10 w-44 bg-neutral-900 px-3 py-2 text-left text-xs font-medium text-neutral-400">Persona</th>
            {days.map((d, i) => {
              const key = toDateInput(d)
              const hours = schedule ? hoursForDate(schedule, key) : null
              return (
                <th key={key} className={clsx('px-1.5 py-2 text-left align-top text-xs font-medium', key === today ? 'text-brasa-300' : 'text-neutral-300')}>
                  {DAY_LABEL[i]} {d.getDate()}
                  {hours && (
                    <span className="block text-[10px] font-normal text-neutral-500">
                      {hours.isOpen && hours.opensAt && hours.closesAt ? `${hours.opensAt.slice(0, 5)}–${hours.closesAt.slice(0, 5)}` : 'Cerrado'}
                    </span>
                  )}
                </th>
              )
            })}
            <th className="px-3 py-2 text-right text-xs font-medium text-neutral-400">Horas</th>
          </tr>
        </thead>
        <tbody>
          {people.map((m) => {
            const row = grid.get(m.userId) ?? Array.from({ length: 7 }, () => [] as Shift[])
            const total = row.flat().reduce((sum, s) => sum + plannedHours(s), 0)
            return (
              <tr key={m.userId} className="border-b border-neutral-800/40 last:border-0">
                <td className="sticky left-0 z-10 bg-neutral-950 px-3 py-2 align-top">
                  <span className="block truncate font-medium text-neutral-100">{m.fullName}</span>
                  <span className="block truncate text-[11px] text-neutral-500">{m.roles.map((r) => r.name).join(', ') || 'Sin rol'}</span>
                </td>
                {row.map((dayShifts, i) => {
                  const key = toDateInput(days[i])
                  return (
                    <td key={key} className={clsx('group min-w-24 px-1 py-1 align-top', key === today && 'bg-brasa-500/[0.03]')}>
                      <div className="space-y-1">
                        {dayShifts.map((s) => (
                          <ShiftChip key={s.id} shift={s} roleName={roleName.get(s.roleId) ?? '—'} now={now} editable={canManage} onClick={() => onDraft({ shift: s })} />
                        ))}
                        {canManage && m.active && (
                          <button
                            type="button"
                            onClick={() => onDraft({ userId: m.userId, day: key })}
                            aria-label={`Agregar turno a ${m.fullName} el ${DAY_LABEL[i]} ${days[i].getDate()}`}
                            className={clsx(
                              'flex w-full items-center justify-center rounded-md border border-dashed border-neutral-800 py-1 text-neutral-600 transition-opacity hover:border-brasa-500/50 hover:text-brasa-300',
                              dayShifts.length > 0 ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : 'opacity-60',
                            )}
                          >
                            <Plus size={12} aria-hidden />
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right align-top text-xs tabular-nums text-neutral-300">{total > 0 ? formatHours(total) : '—'}</td>
              </tr>
            )
          })}
          {people.length === 0 && (
            <tr>
              <td colSpan={9} className="p-6 text-center text-sm text-neutral-500">
                Nadie con ese rol en el equipo de esta cuenta.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
