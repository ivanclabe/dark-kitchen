import type { AccountPermission, Can } from '@/shared/rbac/roles'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_ITEMS, homeSection, isSectionAllowed } from './navigation'

const can =
  (...perms: AccountPermission[]): Can =>
  (p) =>
    perms.includes(p)

describe('secciones permitidas según el rol activo', () => {
  it('Cocina no tiene Dashboard: su inicio es la pantalla de cocina', () => {
    const cocina = can('kitchen.view', 'kitchen.prepare', 'orders.view')
    expect(isSectionAllowed('/dashboard', cocina)).toBe(false)
    // ADR 0031: Operación, que para la línea abre en la vista Cocina (defaultOperationsView).
    expect(homeSection(cocina)).toBe('/operations')
    expect(isSectionAllowed('/operations', cocina)).toBe(true)
    // Las direcciones viejas siguen dentro de Operación (redirigen).
    expect(isSectionAllowed('/kitchen', cocina)).toBe(true)
    expect(isSectionAllowed('/orders', cocina)).toBe(true)
  })

  it('"/" es el inicio de cada rol y siempre se abre', () => {
    expect(isSectionAllowed('/', can())).toBe(true)
  })

  it('caja empieza en Operación aunque tenga Inicio (ADR 0020, D3)', () => {
    expect(homeSection(can('dashboard.view', 'orders.view', 'orders.create', 'kitchen.view'))).toBe('/operations')
  })

  it('el domiciliario empieza en Operación (Despacho) sin ver todos los pedidos', () => {
    const moto = can('dispatch.view', 'dispatch.deliver')
    expect(homeSection(moto)).toBe('/operations')
    expect(isSectionAllowed('/operations', moto)).toBe(true)
  })

  it('un rol que prepara pero no ve Cocina no queda en un inicio cerrado', () => {
    expect(homeSection(can('kitchen.prepare', 'dashboard.view'))).toBe('/dashboard')
  })

  it('una sección de otro módulo no se abre (enlace directo o después de cambiar de rol)', () => {
    const cocina = can('kitchen.view')
    expect(isSectionAllowed('/supply/compras/123', cocina)).toBe(false)
    expect(isSectionAllowed('/customers', cocina)).toBe(false)
    expect(isSectionAllowed('/settings/general', cocina)).toBe(false)
    expect(isSectionAllowed('/users', cocina)).toBe(false)
  })

  it('las recetas son parte del Catálogo', () => {
    expect(isSectionAllowed('/recipes/abc', can('menus.view'))).toBe(true)
    expect(isSectionAllowed('/recipes/abc', can('kitchen.view'))).toBe(false)
  })

  it('Mi perfil siempre se abre, y es el inicio de quien no tiene ningún módulo', () => {
    expect(isSectionAllowed('/perfil', can())).toBe(true)
    expect(homeSection(can())).toBe('/perfil')
  })

  it('el Administrador empieza en el Dashboard', () => {
    expect(homeSection(can('dashboard.view', 'kitchen.view', 'orders.create', 'settings.manage'))).toBe('/dashboard')
  })
})

// ADR 0024: Usuarios and Configuración, below the rail's divider, open by module.
describe('administración de la cuenta en el rail', () => {
  it('Usuarios y Configuración van aparte, después de la operación', () => {
    expect(ADMIN_NAV_ITEMS.map((i) => i.label)).toEqual(['Usuarios', 'Configuración'])
  })

  it('Actividad se abre con audit.view (sin settings.manage)', () => {
    expect(isSectionAllowed('/settings/activity', can('audit.view'))).toBe(true)
    expect(isSectionAllowed('/users', can('team.view'))).toBe(true)
    expect(isSectionAllowed('/settings/billing', can('orders.view'))).toBe(false)
  })
})
