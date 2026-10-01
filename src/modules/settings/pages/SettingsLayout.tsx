import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { PageHeader } from '@/shared/ui/PageHeader'
import { RouteTabs, type RouteTabItem } from '@/shared/ui/RouteTabs'
import { Mic, Settings, Store } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

/** Configuración de la Cuenta activa: datos generales y la voz en este equipo. La IA la configura la organización (ADR 0018). */
export function SettingsLayout() {
  const { can, path, kitchen } = useActiveKitchen()
  const { pathname } = useLocation()
  const tabs: RouteTabItem[] = [
    ...(can('settings.manage') ? [{ to: path('/settings/general'), label: 'General', icon: Store }] : []),
    ...(can('settings.manage') ? [{ to: path('/settings/features'), label: 'Voz en este equipo', icon: Mic }] : []),
  ]

  if (tabs.length === 0) return <Navigate to={path('/')} replace />
  if (pathname.replace(/\/$/, '') === path('/settings')) return <Navigate to={tabs[0].to} replace />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Configuración" icon={Settings} description={`Ajustes de ${kitchen.name}.`} />
      {tabs.length > 1 && <RouteTabs items={tabs} label="Secciones de configuración" />}
      <Outlet />
    </div>
  )
}
