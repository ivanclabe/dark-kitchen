import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { canOpenAdminCenter, orgPath } from '@/shared/org/orgContext'
import { Navigate } from 'react-router-dom'

/**
 * La configuración de la organización ya no vive dentro de una Cuenta
 * (ADR 0012): la dirección vieja /k/:cuenta/organizacion lleva al centro de
 * administración; sin permisos de organización, al inicio de la Cuenta.
 */
export function OrgSettingsRedirect() {
  const { organization, path } = useActiveKitchen()
  if (organization && canOpenAdminCenter(organization)) return <Navigate to={orgPath(organization.slug, '/configuracion')} replace />
  return <Navigate to={path('/')} replace />
}
