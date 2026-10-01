import { EmptyState } from '@/shared/ui/EmptyState'
import { Timer } from 'lucide-react'
import { formatHours, plannedHours, workedHours } from '../lib/week'
import type { Shift, StaffMember } from '../types'

/**
 * Personal → Horas: planned vs worked hours of each person in the week (no
 * payroll). Worked hours come from clock in/out; a shift without clock-in
 * counts as planned only.
 */
export function HoursView({ shifts, members, now }: { shifts: Shift[]; members: StaffMember[]; now: number }) {
  const rows = members
    .map((m) => {
      const own = shifts.filter((s) => s.userId === m.userId)
      const planned = own.filter((s) => !s.unplanned).reduce((sum, s) => sum + plannedHours(s), 0)
      const worked = own.reduce((sum, s) => sum + (workedHours(s, now) ?? 0), 0)
      const missing = own.filter((s) => !s.clockInAt && new Date(s.endsAt).getTime() < now).length
      return { member: m, shifts: own.length, planned, worked, missing }
    })
    .filter((r) => r.shifts > 0)

  if (rows.length === 0) return <EmptyState icon={Timer} title="Sin turnos esta semana" description="Las horas aparecen cuando hay turnos planificados o marcados." />

  const total = rows.reduce((acc, r) => ({ planned: acc.planned + r.planned, worked: acc.worked + r.worked }), { planned: 0, worked: 0 })

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800/60">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-neutral-800/60 bg-neutral-900/60 text-xs text-neutral-400">
            <th className="px-3 py-2 text-left font-medium">Persona</th>
            <th className="px-3 py-2 text-right font-medium">Turnos</th>
            <th className="px-3 py-2 text-right font-medium">Planificadas</th>
            <th className="px-3 py-2 text-right font-medium">Trabajadas</th>
            <th className="px-3 py-2 text-right font-medium">Diferencia</th>
            <th className="px-3 py-2 text-right font-medium">Sin marcar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/40">
          {rows.map((r) => {
            const diff = r.worked - r.planned
            return (
              <tr key={r.member.userId}>
                <td className="px-3 py-2 text-neutral-100">{r.member.fullName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-300">{r.shifts}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-300">{formatHours(r.planned)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-100">{formatHours(r.worked)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${diff < -0.25 ? 'text-amber-400' : diff > 0.25 ? 'text-sky-300' : 'text-neutral-500'}`}>
                  {Math.abs(diff) < 0.25 ? '—' : `${diff > 0 ? '+' : '−'}${formatHours(Math.abs(diff))}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-400">{r.missing || '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-800/60 text-xs text-neutral-300">
            <td className="px-3 py-2 font-medium">Total</td>
            <td />
            <td className="px-3 py-2 text-right tabular-nums">{formatHours(total.planned)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatHours(total.worked)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
