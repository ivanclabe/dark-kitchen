import type { OrganizationPermission } from '@/shared/rbac/permissions'
import type { AccountPermission } from '@/shared/rbac/roles'
import { describe, expect, it } from 'vitest'
import { settingsSections } from './sections'

const labels = (account: AccountPermission[], shared: OrganizationPermission[] = []) =>
  settingsSections({ can: (p) => account.includes(p), canShared: (p) => shared.includes(p) }).map((s) => s.label)

// ADR 0024: Configuración of the account, by permissions.
describe('Configuración sections', () => {
  it('the account administrator: General, IA y voz, Integraciones and Actividad', () => {
    expect(labels(['settings.manage', 'audit.view'])).toEqual(['General', 'IA y voz', 'Integraciones', 'Actividad'])
  })

  it('billing only with the shared billing permission', () => {
    expect(labels(['settings.manage'])).not.toContain('Facturación')
    expect(labels(['settings.manage'], ['billing.view'])).toContain('Facturación')
  })

  it('Quanela Consumer is no longer here: it is its own module (ADR 0046)', () => {
    expect(labels(['settings.manage', 'storefront.manage'])).toEqual(['General', 'IA y voz', 'Integraciones'])
  })

  it('nothing for a kitchen role', () => {
    expect(labels(['kitchen.view', 'kitchen.prepare'])).toEqual([])
  })

  it('the SUPER_ADMIN sees every section', () => {
    expect(labels(['settings.manage', 'audit.view'], ['organization.manage', 'billing.view', 'features.manage', 'observability.view'])).toEqual([
      'General',
      'Facturación',
      'IA y voz',
      'Integraciones',
      'Actividad',
    ])
  })
})
