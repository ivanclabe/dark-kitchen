import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Settings } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { settingsSections } from '../sections'
import { SectionLayout } from '@/shared/ui/SectionLayout'

/**
 * Configuración of the active account (ADR 0024, ADR 0026): General,
 * Facturación, IA y voz, Integraciones and Actividad inside the common shell
 * (one header, one navigation, one content column). Each section renders a
 * SettingsPage (same header, same width).
 */
export function SettingsLayout() {
  const active = useActiveKitchen()
  const { path, kitchen } = active
  const { pathname } = useLocation()
  const sections = settingsSections(active).map((s) => ({ ...s, to: path(s.to) }))

  if (sections.length === 0) return <Navigate to={path('/')} replace />
  const current = pathname.replace(/\/$/, '')
  if (current === path('/settings')) return <Navigate to={sections[0].to} replace />
  // Old address of the AI and voice tab.
  if (current === path('/settings/features')) return <Navigate to={path('/settings/ai')} replace />
  // A section the active role cannot open (an old link, a role switch): go to the first one it can.
  if (!sections.some((s) => current === s.to || current.startsWith(`${s.to}/`))) return <Navigate to={sections[0].to} replace />

  return (
    <SectionLayout title="Configuración" description={`Ajustes de ${kitchen.name}.`} icon={Settings} navLabel="Secciones de configuración" sections={sections}>
      <Outlet />
    </SectionLayout>
  )
}
