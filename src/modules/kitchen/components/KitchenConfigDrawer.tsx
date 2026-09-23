import { Drawer } from '@/shared/ui/Drawer'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { AlarmClock, CalendarDays, Clock } from 'lucide-react'
import { useState } from 'react'
import { HoursCalendarPanel } from './config/HoursCalendarPanel'
import { SlaSettingsPanel } from './config/SlaSettingsPanel'
import { WeeklyHoursPanel } from './config/WeeklyHoursPanel'

export type KitchenConfigTab = 'semanal' | 'calendario' | 'sla'

const TABS: TabItem<KitchenConfigTab>[] = [
  { value: 'semanal', label: 'Horario', icon: Clock },
  { value: 'calendario', label: 'Calendario', icon: CalendarDays },
  { value: 'sla', label: 'Alertas', icon: AlarmClock },
]

/**
 * Configuración del módulo Cocina: horario de atención (semanal + calendario
 * de excepciones) y umbrales de alerta. Todos los roles de Cocina la pueden
 * abrir para consultar; solo ADMIN/MANAGER editan (la RLS es la barrera real).
 * El caller la monta solo mientras está abierta, así cada apertura arranca limpia.
 */
export function KitchenConfigDrawer({ initialTab = 'semanal', canEdit, onClose }: { initialTab?: KitchenConfigTab; canEdit: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<KitchenConfigTab>(initialTab)

  return (
    <Drawer open onClose={onClose} title="Configuración de Cocina" subtitle="Horario de atención y alertas">
      <div className="space-y-5">
        <Tabs value={tab} onChange={setTab} items={TABS} />
        {tab === 'semanal' && <WeeklyHoursPanel canEdit={canEdit} />}
        {tab === 'calendario' && <HoursCalendarPanel canEdit={canEdit} />}
        {tab === 'sla' && <SlaSettingsPanel canEdit={canEdit} />}
      </div>
    </Drawer>
  )
}
