import { dangerButtonClass, primaryButtonClass, tableWrapperClass, tdClass, thClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSetTodayAvailability, useTodayMenu } from '../hooks/useMenus'

export function TodayMenuPage() {
  const { data: items, isLoading } = useTodayMenu()
  const setAvailability = useSetTodayAvailability()
  const { show } = useToast()

  const today = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })

  async function handleToggle(menuItemId: string, productName: string, currentlyAvailable: boolean) {
    try {
      await setAvailability.mutateAsync({ menuItemId, available: !currentlyAvailable })
      show(currentlyAvailable ? `${productName} marcado como agotado por hoy.` : `${productName} disponible de nuevo.`)
    } catch (err) {
      show(getErrorMessage(err, 'Error al actualizar la disponibilidad'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={22} className="text-brasa-500" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-50">Menú del día</h1>
            <p className="text-sm text-neutral-400">{today}</p>
          </div>
        </div>
        <Link to="/menus" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200">
          <ArrowLeft size={14} /> Volver a menús
        </Link>
      </div>

      <p className="text-xs text-neutral-500">
        Marcar un plato como "no disponible" aplica solo para hoy — no afecta el menú base ni otros días.
      </p>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Plato</th>
              <th className={thClass}>Menú</th>
              <th className={thClass}>Precio hoy</th>
              <th className={thClass}>Horario</th>
              <th className={thClass}>Disponibilidad</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={6}>
                  Cargando…
                </td>
              </tr>
            )}
            {items?.map((item) => (
              <tr key={item.id}>
                <td className={tdClass}>{item.productName}</td>
                <td className={tdClass}>{item.menuName}</td>
                <td className={tdClass}>${item.effectivePrice.toFixed(2)}</td>
                <td className={tdClass}>
                  <span className="inline-flex items-center gap-1 text-neutral-400">
                    <Clock size={12} />
                    {item.startTime && item.endTime ? `${item.startTime.slice(0, 5)}–${item.endTime.slice(0, 5)}` : 'Todo el día'}
                  </span>
                </td>
                <td className={tdClass}>
                  {item.effectiveAvailable ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                      <CheckCircle2 size={11} /> Disponible
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                      <XCircle size={11} /> No disponible
                    </span>
                  )}
                </td>
                <td className={`${tdClass} text-right`}>
                  <button
                    onClick={() => handleToggle(item.id, item.productName, item.effectiveAvailable)}
                    disabled={setAvailability.isPending}
                    className={item.effectiveAvailable ? dangerButtonClass : primaryButtonClass}
                  >
                    {item.effectiveAvailable ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                    Marcar {item.effectiveAvailable ? 'agotado' : 'disponible'}
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && items?.length === 0 && (
              <tr>
                <td className={tdClass} colSpan={6}>
                  No hay platos activos en ningún menú. Ve a "Menús" para agregar platos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
