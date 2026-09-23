import { Tooltip } from '@/shared/ui/Tooltip'
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'

import { toDateInput, todayStr } from '@/shared/utils/format'

export { todayStr }

function shiftDate(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + days)
  return toDateInput(next)
}

// Altura fija en cada elemento (en vez de dejar que el padding la decida):
// el <input type="date"> nativo no respeta el padding de forma consistente
// entre navegadores (el ícono/spinner del selector de fecha impone su
// propia altura mínima), así que la pastilla terminaba más alta que sus
// vecinas (Configurar/Alertas, Escuchar) aunque compartieran el mismo p-1
// exterior. size-8 en cada hijo (32px) + p-1 exterior (4px) = 40px en las
// tres pastillas del header, igual que el resto de los controles h-10.
const navButtonClass =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400'

/**
 * Navegador de fecha del módulo de Cocina: día anterior / selector nativo /
 * día siguiente + salto directo a "Hoy". No deja avanzar más allá de hoy.
 * `date` es siempre "YYYY-MM-DD"; quien lo consume decide si === todayStr()
 * significa "cola en vivo" o "foto histórica de hoy".
 */
export function KitchenDateNav({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const isToday = date >= todayStr()

  return (
    <div className="inline-flex h-10 items-center gap-0.5 rounded-full border border-neutral-800/60 bg-neutral-900/60 p-1">
      <Tooltip label="Día anterior" side="top">
        <button type="button" onClick={() => onChange(shiftDate(date, -1))} className={navButtonClass} aria-label="Día anterior">
          <ChevronLeft size={16} />
        </button>
      </Tooltip>

      <label className="relative flex h-8 shrink-0 items-center">
        <CalendarClock size={14} className="pointer-events-none absolute left-2.5 text-neutral-500" />
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="h-full rounded-md border-none bg-transparent py-0 pl-8 pr-2 text-sm font-medium text-neutral-200 outline-none [color-scheme:dark]"
        />
      </label>

      <Tooltip label="Día siguiente" side="top">
        <button
          type="button"
          onClick={() => onChange(shiftDate(date, 1))}
          disabled={isToday}
          className={navButtonClass}
          aria-label="Día siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </Tooltip>

      {!isToday && (
        <button
          type="button"
          onClick={() => onChange(todayStr())}
          className="ml-1 flex h-8 shrink-0 items-center rounded-full bg-brasa-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-brasa-400"
        >
          Hoy
        </button>
      )}
    </div>
  )
}
