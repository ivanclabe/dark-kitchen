import { useKitchenSchedule } from '@/modules/kitchen/hooks/useKitchenSchedule'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { useNow } from '@/shared/hooks/useNow'
import { Button, IconButton } from '@/shared/ui/Button'
import { ErrorState } from '@/shared/ui/ErrorState'
import { Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Sun, Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClockCard } from '../components/ClockCard'
import { ShiftDrawer, type ShiftDraft } from '../components/ShiftDrawer'
import { useCopyWeek, useShifts, useStaffMembers } from '../hooks/useStaff'
import { addDays, startOfWeek } from '../lib/week'
import { HoursView } from '../views/HoursView'
import { TodayView } from '../views/TodayView'
import { WeekView } from '../views/WeekView'

type StaffView = 'today' | 'week' | 'hours'

const VIEWS: TabItem<StaffView>[] = [
  { value: 'today', label: 'Hoy', icon: Sun },
  { value: 'week', label: 'Semana', icon: CalendarDays },
  { value: 'hours', label: 'Horas', icon: Timer },
]

const weekLabel = (start: Date) => {
  const end = addDays(start, 6)
  const fmt = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  return `${fmt(start)} – ${fmt(end)}`
}

/**
 * Personal y Turnos (ADR 0020): Hoy (who is working, late, coming), Semana
 * (plan people × days, copy the previous week) and Horas (planned vs
 * worked). People and roles are the account's team; shifts are flexible.
 */
export function StaffPage() {
  const { can } = useActiveKitchen()
  const canManage = can('staff.manage')
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.find((v) => v.value === params.get('view'))?.value ?? 'today') as StaffView
  const now = useNow(60_000)
  const { show } = useToast()

  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = useMemo(() => addDays(startOfWeek(new Date()), weekOffset * 7), [weekOffset])
  const [roleFilter, setRoleFilter] = useState('')
  const [draft, setDraft] = useState<ShiftDraft | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)

  const todayStart = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const range =
    view === 'today'
      ? { from: todayStart.toISOString(), to: addDays(todayStart, 1).toISOString() }
      : { from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString() }

  const members = useStaffMembers()
  const shifts = useShifts(range.from, range.to)
  const { data: schedule } = useKitchenSchedule()
  const copyWeek = useCopyWeek()

  const roles = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members.data ?? []) for (const r of m.roles) map.set(r.id, r.name)
    return [...map].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [members.data])

  async function copyPrevious() {
    try {
      const result = (await copyWeek.mutateAsync({ from: addDays(weekStart, -7).toISOString(), to: weekStart.toISOString() })) as { copied: number; skipped: number }
      show(result.copied ? `Se copiaron ${result.copied} turnos${result.skipped ? ` (${result.skipped} se cruzaban y se omitieron)` : ''}.` : 'No había turnos nuevos para copiar.')
      setCopyOpen(false)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo copiar la semana'), 'error')
    }
  }

  const loading = members.isLoading || shifts.isLoading
  const error = members.error ?? shifts.error

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Personal"
        icon={CalendarClock}
        description="Turnos del equipo de esta cuenta: quién trabaja, cuándo y cuántas horas."
        actions={
          <>
            <Tabs value={view} onChange={(v) => setParams(v === 'today' ? {} : { view: v }, { replace: true })} items={VIEWS} />
            {canManage && (
              <Button variant="primary" icon={Plus} onClick={() => setDraft({})} disabled={!members.data?.length}>
                Nuevo turno
              </Button>
            )}
          </>
        }
      />

      <ClockCard />

      {view !== 'today' && (
        <div className="flex flex-wrap items-center gap-2">
          <IconButton icon={ChevronLeft} aria-label="Semana anterior" onClick={() => setWeekOffset((w) => w - 1)} />
          <span className="min-w-36 text-center text-sm font-medium text-neutral-200">{weekLabel(weekStart)}</span>
          <IconButton icon={ChevronRight} aria-label="Semana siguiente" onClick={() => setWeekOffset((w) => w + 1)} />
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
              Esta semana
            </Button>
          )}
          {view === 'week' && (
            <>
              <Select aria-label="Rol" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="!mt-0 ml-auto w-auto">
                <option value="">Todos los roles</option>
                {roles.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
              {canManage && (
                <Button variant="secondary" size="sm" icon={Copy} onClick={() => setCopyOpen(true)}>
                  Copiar semana anterior
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <LoadingState rows={5} />
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void members.refetch()
              void shifts.refetch()
            }}
          />
        ) : view === 'today' ? (
          <TodayView shifts={shifts.data ?? []} members={members.data ?? []} now={now} canManage={canManage} onDraft={setDraft} />
        ) : view === 'week' ? (
          <WeekView weekStart={weekStart} members={members.data ?? []} shifts={shifts.data ?? []} schedule={schedule} roleFilter={roleFilter} canManage={canManage} now={now} onDraft={setDraft} />
        ) : (
          <HoursView shifts={shifts.data ?? []} members={members.data ?? []} now={now} />
        )}
      </div>

      {draft && members.data && <ShiftDrawer draft={draft} members={members.data} onClose={() => setDraft(null)} />}
      <ConfirmDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        onConfirm={() => void copyPrevious()}
        pending={copyWeek.isPending}
        title="Copiar la semana anterior"
        confirmLabel="Copiar turnos"
        description={<p>Los turnos de {weekLabel(addDays(weekStart, -7))} se copian a esta semana, mismo día y hora. Los que se crucen con un turno existente se omiten.</p>}
      />
    </div>
  )
}
