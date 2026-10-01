import type { AccountPermission, Can } from '@/shared/rbac/roles'
import { describe, expect, it } from 'vitest'
import { homeSection, isSectionAllowed } from './navigation'

const can =
  (...perms: AccountPermission[]): Can =>
  (p) =>
    perms.includes(p)

describe('secciones permitidas según el rol activo', () => {
  it('Cocina no tiene Dashboard: su inicio es la pantalla de cocina', () => {
    const cocina = can('kitchen.view', 'kitchen.prepare', 'orders.view')
    expect(isSectionAllowed('/dashboard', cocina)).toBe(false)
    expect(homeSection(cocina)).toBe('/kitchen')
    expect(isSectionAllowed('/kitchen', cocina)).toBe(true)
    // Ve los pedidos (para abrir su detalle) aunque no los crea.
    expect(isSectionAllowed('/orders', cocina)).toBe(true)
  })

  it('"/" es el inicio de cada rol y siempre se abre', () => {
    expect(isSectionAllowed('/', can())).toBe(true)
  })

  it('caja empieza en Pedidos aunque tenga Dashboard (ADR 0020, D3)', () => {
    expect(homeSection(can('dashboard.view', 'orders.view', 'orders.create', 'kitchen.view'))).toBe('/orders')
  })

  it('el domiciliario empieza en Pedidos (Despacho) sin ver todos los pedidos', () => {
    const moto = can('dispatch.view', 'dispatch.deliver')
    expect(homeSection(moto)).toBe('/orders')
    expect(isSectionAllowed('/orders', moto)).toBe(true)
    expect(isSectionAllowed('/kitchen', moto)).toBe(false)
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
