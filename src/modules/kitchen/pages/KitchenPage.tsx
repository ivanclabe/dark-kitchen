import { useNow } from '@/shared/hooks/useNow'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { Bell, ChefHat, Gauge, Kanban, LayoutGrid, List, Volume2, VolumeX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useKitchenQueue } from '../hooks/useKitchen'
import { useNewTicketAlert } from '../hooks/useNewTicketAlert'
import { ComingSoonView } from '../views/ComingSoonView'
import { GridView } from '../views/GridView'
import { VoiceCommandBar } from '../voice/VoiceCommandBar'

type KitchenView = 'grid' | 'kanban' | 'list' | 'sla'

const VIEW_PREF_KEY = 'dk-kitchen-view'

const VIEW_ITEMS: TabItem<KitchenView>[] = [
  { value: 'kanban', label: 'Kanban', icon: Kanban },
  { value: 'list', label: 'Lista', icon: List },
  { value: 'grid', label: 'Grid', icon: LayoutGrid },
  { value: 'sla', label: 'SLA', icon: Gauge },
]

function readViewPref(): KitchenView {
  try {
    const stored = localStorage.getItem(VIEW_PREF_KEY)
    if (stored === 'grid' || stored === 'kanban' || stored === 'list' || stored === 'sla') return stored
  } catch {
    // localStorage puede no estar disponible (modo privado) — se usa el default.
  }
  return 'grid'
}

export function KitchenPage() {
  const { data: tickets, isLoading } = useKitchenQueue()
  const now = useNow()
  const { newIds, acknowledge, soundEnabled, toggleSound } = useNewTicketAlert(tickets)
  const [view, setView] = useState<KitchenView>(readViewPref)

  const sortedTickets = useMemo(
    () =>
      tickets
        ? [...tickets].sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          })
        : undefined,
    [tickets],
  )

  function handleViewChange(next: KitchenView) {
    setView(next)
    try {
      localStorage.setItem(VIEW_PREF_KEY, next)
    } catch {
      // localStorage puede no estar disponible (modo privado) — no crítico.
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChefHat size={22} className="text-brasa-500" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-neutral-50 2xl:text-3xl">Cocina</h1>
              {newIds.size > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brasa-600 px-2 py-0.5 text-xs font-semibold text-white">
                  <Bell size={12} /> {newIds.size} {newIds.size === 1 ? 'nuevo' : 'nuevos'}
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-400">Pedidos confirmados en cola. Se actualiza automáticamente.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Silenciar alerta de pedidos nuevos' : 'Activar alerta de pedidos nuevos'}
            className="rounded-md border border-neutral-700 p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <VoiceCommandBar tickets={sortedTickets} />
        </div>
      </div>

      <Tabs value={view} onChange={handleViewChange} items={VIEW_ITEMS} />

      {view === 'grid' && (
        <GridView tickets={sortedTickets} isLoading={isLoading} now={now} newIds={newIds} onAcknowledge={acknowledge} />
      )}
      {view === 'kanban' && <ComingSoonView icon={Kanban} label="Kanban" />}
      {view === 'list' && <ComingSoonView icon={List} label="Lista" />}
      {view === 'sla' && <ComingSoonView icon={Gauge} label="SLA" />}
    </div>
  )
}
