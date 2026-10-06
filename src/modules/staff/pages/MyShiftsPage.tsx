import { useAuth } from '@/shared/hooks/useAuth'
import { Page } from '@/shared/ui/Page'
import { useNow } from '@/shared/hooks/useNow'
import { Card } from '@/shared/ui/Card'
import { PageHeader } from '@/shared/ui/PageHeader'
import { CalendarClock, CalendarDays } from 'lucide-react'
import { useMemo } from 'react'
import { ClockCard } from '../components/ClockCard'
import { useShifts } from '../hooks/useStaff'
import { addDays, formatHours, formatShiftRange, plannedHours, workedHours } from '../lib/week'

/** Mis turnos (ADR 0020): anyone, without permissions — clock in/out, the next two weeks, the last one. */
export function MyShiftsPage() {
  const { profile } = useAuth()
  const range = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return { from: addDays(start, -7).toISOString(), to: addDays(start, 15).toISOString(), today: start.getTime() }
  }, [])
  const now = useNow(60_000)
  const { data: shifts } = useShifts(range.from, range.to, { userId: profile?.id, enabled: !!profile })
  const upcoming = (shifts ?? []).filter((s) => new Date(s.endsAt).getTime() >= now)
  const past = (shifts ?? []).filter((s) => new Date(s.endsAt).getTime() < now)
  const workedLastWeek = past.reduce((sum, s) => sum + (workedHours(s, now) ?? 0), 0)

  const day = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <Page>
      <PageHeader help="shifts" title="Mis turnos" icon={CalendarClock} description="Tus turnos en esta cuenta y tu entrada y salida." />
      <ClockCard />
      <Card title="Próximos turnos" icon={CalendarDays}>
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-500">No tienes turnos programados en las próximas dos semanas.</p>
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {upcoming.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="capitalize text-neutral-100">{day(s.startsAt)}</span>
                <span className="tabular-nums text-neutral-300">
                  {formatShiftRange(s)} · {formatHours(plannedHours(s))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {past.length > 0 && <p className="text-sm text-neutral-500">Última semana: {formatHours(workedLastWeek)} trabajadas en {past.length} turnos.</p>}
    </Page>
  )
}
