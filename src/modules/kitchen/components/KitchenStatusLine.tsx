import { useNow } from '@/shared/hooks/useNow'
import clsx from 'clsx'
import { useKitchenSchedule } from '../hooks/useKitchenSchedule'
import { describeStatus, kitchenStatus } from '../lib/schedule'

function clock(now: number): string {
  return new Date(now).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/**
 * Indicador bajo el título "Cocina": abierta/cerrada según el horario
 * configurado + reloj en vivo + atrasados. Sin horario configurado muestra
 * solo "En vivo" — no afirma abierta ni cerrada con datos inventados. Tiene
 * su propio reloj de 1 s para no re-renderizar el tablero cada segundo.
 */
export function KitchenStatusLine({ lateCount, canConfigure, onConfigure }: { lateCount: number; canConfigure: boolean; onConfigure: () => void }) {
  const now = useNow(1000)
  const { data: schedule } = useKitchenSchedule()
  const status = schedule ? kitchenStatus(schedule, new Date(now)) : { state: 'unconfigured' as const }
  const note = status.state !== 'unconfigured' ? status.note : null

  const dot = status.state === 'closed' ? 'bg-neutral-500' : 'bg-emerald-400'
  const label = status.state === 'unconfigured' ? 'En vivo' : describeStatus(status, new Date(now))

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-neutral-500">
      <span className="relative flex size-2 shrink-0" aria-hidden>
        {status.state !== 'closed' && <span className={clsx('absolute inline-flex size-full animate-ping rounded-full opacity-60', dot)} />}
        <span className={clsx('relative inline-flex size-2 rounded-full', dot)} />
      </span>
      <button
        type="button"
        onClick={onConfigure}
        title="Ver horario de la cocina"
        className={clsx('rounded hover:text-neutral-300 hover:underline underline-offset-4', status.state === 'open' && 'text-neutral-300')}
      >
        {label}
      </button>
      {note && <span className="text-amber-300/90">· {note}</span>}
      <span className="tabular-nums">· {clock(now)}</span>
      {lateCount > 0 && (
        <span className="font-medium text-red-400">
          · {lateCount} {lateCount === 1 ? 'atrasado' : 'atrasados'}
        </span>
      )}
      {status.state === 'unconfigured' && canConfigure && (
        <button type="button" onClick={onConfigure} className="text-brasa-400 hover:text-brasa-300 hover:underline underline-offset-4">
          · Configurar horario
        </button>
      )}
    </p>
  )
}
