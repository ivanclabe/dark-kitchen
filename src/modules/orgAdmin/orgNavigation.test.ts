import { canOpenAdminCenter, orgPath } from '@/shared/org/orgContext'
import { describe, expect, it } from 'vitest'
import { isOrgSectionAllowed, orgHomeSection, visibleOrgNav } from './orgNavigation'

const can = (perms: string[]) => (p: string) => perms.includes(p)
const ALL = ['organization.view', 'organization.manage', 'accounts.view', 'accounts.create', 'accounts.manage', 'users.view', 'users.manage', 'roles.manage', 'master_menus.manage', 'features.manage', 'observability.view', 'billing.view']

describe('centro de administración (ADR 0012)', () => {
  it('solo abre el centro quien tiene algún permiso de administración (no basta organization.view)', () => {
    expect(canOpenAdminCenter({ permissions: ['organization.view'] })).toBe(false)
    expect(canOpenAdminCenter({ permissions: ['organization.view', 'billing.view'] })).toBe(true)
    expect(canOpenAdminCenter(null)).toBe(false)
  })

  it('el SUPER_ADMIN ve todas las secciones; empieza en el Resumen', () => {
    expect(visibleOrgNav(can(ALL)).map((i) => i.label)).toEqual(['Resumen', 'Cuentas', 'Observabilidad', 'Equipos', 'Facturación', 'IA y voz', 'Configuración', 'Menús maestros'])
    expect(orgHomeSection(can(ALL))).toBe('/')
  })

  it('cada sección exige su permiso; sin observabilidad, el inicio es la primera permitida', () => {
    const perms = can(['organization.view', 'billing.view'])
    expect(visibleOrgNav(perms).map((i) => i.to)).toEqual(['/facturacion'])
    expect(orgHomeSection(perms)).toBe('/facturacion')
    expect(isOrgSectionAllowed('/equipos', perms)).toBe(false)
    expect(isOrgSectionAllowed('/facturacion', perms)).toBe(true)
    expect(isOrgSectionAllowed('/', perms)).toBe(false)
  })

  it('arma las rutas del centro', () => {
    expect(orgPath('grupo-xyz')).toBe('/o/grupo-xyz')
    expect(orgPath('grupo-xyz', '/equipos')).toBe('/o/grupo-xyz/equipos')
  })
})

describe('IA y voz (ADR 0014)', () => {
  it('solo con features.manage; Configuración queda para los datos del negocio', () => {
    expect(visibleOrgNav(can(['features.manage'])).map((i) => i.to)).toEqual(['/ai'])
    expect(visibleOrgNav(can(['organization.manage'])).map((i) => i.to)).toEqual(['/configuracion'])
    expect(isOrgSectionAllowed('/ai', can(['organization.manage']))).toBe(false)
  })
})
