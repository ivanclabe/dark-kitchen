import type { AccountPermission, Can } from '@/shared/rbac/roles'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_ITEMS, fitRail, homeSection, isSectionAllowed, NAV_ITEMS, RAIL_SIZES } from './navigation'

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

// The rail fits the window: what does not fit goes into «Más», and the user menu never falls off screen.
describe('el rail cabe en la pantalla', () => {
  const all = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS]
  const { item, gap, divider } = RAIL_SIZES

  it('sin medir (o con espacio de sobra) muestra todo', () => {
    expect(fitRail(all, null).overflow).toEqual([])
    expect(fitRail(all, 2000).visible).toHaveLength(all.length)
  })

  it('agrupa: Día a día, Clientes y ventas, Negocio y Administración, en ese orden', () => {
    expect([...new Set(all.map((i) => i.group))]).toEqual(['daily', 'sales', 'business', 'admin'])
    expect(all.filter((i) => i.group === 'daily').map((i) => i.label)).toEqual(['Inicio', 'Centro de operaciones', 'Planificador de Menús', 'Abastecimiento'])
  })

  it('en una pantalla baja, lo que no cabe pasa a «Más» sin perder ningún módulo', () => {
    // Exactly the first group plus «Más»: 5 slots, 4 gaps.
    const height = 5 * item + 4 * gap
    const { visible, overflow } = fitRail(all, height)
    expect(visible.map((i) => i.label)).toEqual(['Inicio', 'Centro de operaciones', 'Planificador de Menús', 'Abastecimiento'])
    expect([...visible, ...overflow]).toEqual(all)
    // One pixel less and Abastecimiento moves too.
    expect(fitRail(all, height - 1).visible).toHaveLength(3)
  })

  it('cuenta los separadores entre grupos', () => {
    // Daily (4) + divider + Clientes + «Más».
    const height = 6 * item + divider + 6 * gap
    expect(fitRail(all, height).visible.at(-1)?.label).toBe('Clientes')
    expect(fitRail(all, height - 1).visible.at(-1)?.label).toBe('Abastecimiento')
  })
})
