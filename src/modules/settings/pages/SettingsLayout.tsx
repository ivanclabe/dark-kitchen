import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { PageHeader } from '@/shared/ui/PageHeader'
import { RouteTabs, type RouteTabItem } from '@/shared/ui/RouteTabs'
import { Settings, Sparkles, Store } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

/** Configuración de la Cuenta activa: datos generales y funciones (IA, voz). Cada pestaña según el permiso del rol. */
export function SettingsLayout() {
  const { can, path, kitchen } = useActiveKitchen()
  const { pathname } = useLocation()
  const tabs: RouteTabItem[] = [
    ...(can('settings.manage') ? [{ to: path('/settings/general'), label: 'General', icon: Store }] : []),
    ...(can('ai.manage') || can('settings.manage') ? [{ to: path('/settings/features'), label: 'Funciones', icon: Sparkles }] : []),
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
