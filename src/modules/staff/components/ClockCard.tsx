import { useAuth } from '@/shared/hooks/useAuth'
import { useNow } from '@/shared/hooks/useNow'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { LogIn, LogOut, Timer } from 'lucide-react'
import { useMemo } from 'react'
import { useClockIn, useClockOut, useShifts } from '../hooks/useStaff'
import { formatHours, formatShiftRange, workedHours } from '../lib/week'

/**
 * Clock in / out of the person (ADR 0020). No permission needed: everyone
 * marks their own shift. Without a planned shift, clocking in creates an
 * unplanned one that the planner sees.
 */
export function ClockCard() {
  const { profile } = useAuth()
  const now = useNow(30_000)
  // From 16 h ago to 24 h ahead, recomputed every half hour (enough for "today").
  const bucket = Math.floor(now / 1_800_000)
  const range = useMemo(() => {
    const at = bucket * 1_800_000
    return { from: new Date(at - 16 * 3_600_000).toISOString(), to: new Date(at + 24 * 3_600_000).toISOString() }
  }, [bucket])
  const { data: shifts, isLoading } = useShifts(range.from, range.to, { userId: profile?.id, enabled: !!profile })
  const clockIn = useClockIn()
  const clockOut = useClockOut()
  const { show } = useToast()

  const open = shifts?.find((s) => s.clockInAt && !s.clockOutAt)
  const next = shifts?.find((s) => !s.clockInAt && new Date(s.endsAt).getTime() > now)

  async function run(action: 'in' | 'out') {
    try {
      if (action === 'in') await clockIn.mutateAsync(undefined)
      else await clockOut.mutateAsync(undefined)
      show(action === 'in' ? 'Entrada marcada.' : 'Salida marcada.')
    } catch (err) {
      show(getErrorMessage(err, action === 'in' ? 'No se pudo marcar la entrada' : 'No se pudo marcar la salida'), 'error')
    }
  }

  return (
    <Card title="Mi turno" icon={Timer}>
      {isLoading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-200">
            Trabajando desde las {new Date(open.clockInAt!).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            <span className="block text-xs text-neutral-500">
              {open.unplanned ? 'Turno sin programar' : `Turno ${formatShiftRange(open)}`} · {formatHours(workedHours(open, now) ?? 0)}
            </span>
          </p>
          <Button variant="secondary" icon={LogOut} loading={clockOut.isPending} onClick={() => void run('out')}>
            Marcar salida
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-200">
            {next ? `Tu turno: ${formatShiftRange(next)}` : 'No tienes turno programado ahora.'}
            <span className="block text-xs text-neutral-500">{next ? 'Puedes marcar desde 2 horas antes.' : 'Si estás trabajando, marca tu entrada igual.'}</span>
          </p>
          <Button variant="primary" icon={LogIn} loading={clockIn.isPending} onClick={() => void run('in')}>
            Marcar entrada
          </Button>
        </div>
      )}
    </Card>
  )
}
