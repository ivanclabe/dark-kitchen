import type { AccountPermission, Can } from '@/shared/rbac/roles'
import { describe, expect, it } from 'vitest'
import { homeSection, isSectionAllowed } from './navigation'

const can =
  (...perms: AccountPermission[]): Can =>
  (p) =>
    perms.includes(p)

describe('secciones permitidas según el rol activo', () => {
  it('Cocina no tiene Dashboard: su inicio es el tablero', () => {
    const cocina = can('kitchen.view', 'kitchen.prepare', 'orders.view')
    expect(isSectionAllowed('/', cocina)).toBe(false)
    expect(homeSection(cocina)).toBe('/kitchen')
    expect(isSectionAllowed('/kitchen', cocina)).toBe(true)
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
    expect(homeSection(can('dashboard.view', 'kitchen.view'))).toBe('/')
  })
})
