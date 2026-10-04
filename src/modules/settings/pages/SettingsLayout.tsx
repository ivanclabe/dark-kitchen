import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { PageHeader } from '@/shared/ui/PageHeader'
import { RouteTabs, type RouteTabItem } from '@/shared/ui/RouteTabs'
import { Settings } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { settingsSections } from '../sections'

/** Configuración of the active account: General, Facturación, IA y voz, Integraciones and Actividad. */
export function SettingsLayout() {
  const active = useActiveKitchen()
  const { path, kitchen } = active
  const { pathname } = useLocation()
  const sections = settingsSections(active)
  const tabs: RouteTabItem[] = sections.map((s) => ({ to: path(s.to), label: s.label, icon: s.icon }))

  if (tabs.length === 0) return <Navigate to={path('/')} replace />
  const current = pathname.replace(/\/$/, '')
  if (current === path('/settings')) return <Navigate to={tabs[0].to} replace />
  // Old address of the AI and voice tab.
  if (current === path('/settings/features')) return <Navigate to={path('/settings/ai')} replace />
  // A section the active role cannot open (an old link, a role switch): go to the first one it can.
  if (!tabs.some((t) => current === t.to || current.startsWith(`${t.to}/`))) return <Navigate to={tabs[0].to} replace />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Configuración" icon={Settings} description={`Ajustes de ${kitchen.name}.`} />
      {tabs.length > 1 && <RouteTabs items={tabs} label="Secciones de configuración" />}
      <Outlet />
    </div>
  )
}
