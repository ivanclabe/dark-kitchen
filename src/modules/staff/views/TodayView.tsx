import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import clsx from 'clsx'
import { AlarmClock, CalendarCheck, CheckCircle2, Clock, UserCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatShiftRange, isLate } from '../lib/week'
import type { Shift, StaffMember } from '../types'
import type { ShiftDraft } from '../components/ShiftDrawer'

function Row({ shift, person, role, extra, onClick }: { shift: Shift; person: string; role: string; extra?: ReactNode; onClick?: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center justify-between gap-3 py-2 text-left disabled:cursor-default">
        <span className="min-w-0">
          <span className="block truncate text-sm text-neutral-100">{person}</span>
          <span className="block truncate text-xs text-neutral-500">
            {role} · {formatShiftRange(shift)}
          </span>
        </span>
        {extra}
      </button>
    </li>
  )
}

/**
 * Personal → Hoy: who is working now, who is late or did not come, who comes
 * later and who already left. "Working" = clocked in, or inside a planned
 * shift without a clock-in system in use.
 */
export function TodayView({ shifts, members, now, canManage, onDraft }: { shifts: Shift[]; members: StaffMember[]; now: number; canManage: boolean; onDraft: (d: ShiftDraft) => void }) {
  const person = (id: string) => members.find((m) => m.userId === id)?.fullName ?? 'Ex miembro del equipo'
  const role = (id: string) => members.flatMap((m) => m.roles).find((r) => r.id === id)?.name ?? '—'
  const open = (s: Shift) => (canManage ? () => onDraft({ shift: s }) : undefined)

  const working = shifts.filter((s) => s.clockInAt && !s.clockOutAt)
  const late = shifts.filter((s) => !s.clockInAt && isLate(s, now) && new Date(s.endsAt).getTime() > now)
  const upcoming = shifts.filter((s) => !s.clockInAt && new Date(s.startsAt).getTime() > now)
  const missed = shifts.filter((s) => !s.clockInAt && new Date(s.endsAt).getTime() <= now)
  const done = shifts.filter((s) => s.clockOutAt)

  if (shifts.length === 0) {
    return <EmptyState icon={CalendarCheck} title="Nadie tiene turno hoy" description="Planifica la semana en la pestaña Semana." />
  }

  const section = (title: string, icon: typeof Clock, list: Shift[], tone: string, extra?: (s: Shift) => ReactNode) =>
    list.length > 0 && (
      <Card title={`${title} (${list.length})`} icon={icon}>
        <ul className={clsx('divide-y divide-neutral-800/60', tone)}>
          {list.map((s) => (
            <Row key={s.id} shift={s} person={person(s.userId)} role={role(s.roleId)} onClick={open(s)} extra={extra?.(s)} />
          ))}
        </ul>
      </Card>
    )

  const since = (iso: string) => `desde ${new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {section('Trabajando ahora', UserCheck, working, '', (s) => <span className="shrink-0 text-xs text-emerald-400">{since(s.clockInAt!)}</span>)}
      {section('Tarde o sin marcar', AlarmClock, late, '', () => <span className="shrink-0 text-xs text-red-400">Sin entrada</span>)}
      {section('Llegan más tarde', Clock, upcoming, '')}
      {section('Terminaron', CheckCircle2, done, '')}
      {section('No marcaron', AlarmClock, missed, 'opacity-70')}
    </div>
  )
}
