import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/shared/lib/queryClient'
import { setActiveKitchenId, setActiveRoleId } from './activeKitchen'
import { buildActiveKitchen, kitchenPath } from './activeKitchenContext'
import { SUPER_ADMIN_ROLE_ID, toKitchenView, type MyAccountRow, type MyContext } from './kitchensApi'

const hash = (key: unknown[]) => queryClient.getDefaultOptions().queries!.queryKeyHashFn!(key)

afterEach(() => {
  setActiveKitchenId(null)
  setActiveRoleId(null)
})

describe('caché por Cuenta y rol activo', () => {
  it('la misma consulta en dos Cuentas son entradas distintas', () => {
    setActiveKitchenId('cuenta-a')
    const a = hash(['orders'])
    setActiveKitchenId('cuenta-b')
    const b = hash(['orders'])
    expect(a).not.toBe(b)
  })

  it('la misma consulta con otro rol activo es otra entrada (no se ve lo cargado como Administrador)', () => {
    setActiveKitchenId('cuenta-a')
    setActiveRoleId('rol-admin')
    const admin = hash(['customers'])
    setActiveRoleId('rol-cocina')
    expect(hash(['customers'])).not.toBe(admin)
  })

  it('el contexto del usuario es global: no depende de la Cuenta ni del rol', () => {
    setActiveKitchenId('cuenta-a')
    setActiveRoleId('rol-admin')
    const a = hash(['my-kitchens', 'context', 'u1'])
    setActiveKitchenId('cuenta-b')
    setActiveRoleId('rol-cocina')
    expect(hash(['my-kitchens', 'context', 'u1'])).toBe(a)
  })
})

describe('rutas dentro de la Cuenta', () => {
  it('antepone /k/{slug}', () => {
    expect(kitchenPath('centro', '/kitchen')).toBe('/k/centro/kitchen')
    expect(kitchenPath('centro', 'supply/compras')).toBe('/k/centro/supply/compras')
    expect(kitchenPath('centro', '/')).toBe('/k/centro')
  })
})

describe('rol activo', () => {
  const ctx: MyContext = {
    profile: { id: 'u1', fullName: 'Juan', avatarKey: null, active: true, isPlatformAdmin: false, lastAccountId: null },
    accountPermissions: ['orders.view', 'orders.create', 'kitchen.prepare', 'team.manage'],
    organizations: [{ id: 'o1', slug: 'grupo', name: 'Grupo XYZ', active: true, isOwner: false, isSuperAdmin: false, status: 'active', permissions: [] }],
    accounts: [],
  }
  const juan: MyAccountRow = {
    id: 'k1',
    slug: 'centro',
    name: 'Centro',
    organizationId: 'o1',
    iconKey: null,
    active: true,
    superAdmin: false,
    defaultRoleId: 'admin',
    roles: [
      { id: 'admin', key: 'ADMIN', name: 'Administrador', isSystem: true, permissions: ['orders.view', 'team.manage'] },
      { id: 'cocina', key: 'KITCHEN', name: 'Cocina', isSystem: true, permissions: ['kitchen.prepare'] },
    ],
  }

  it('sin elegir, entra con el predeterminado; eligiendo, con ese rol', () => {
    expect(toKitchenView(ctx, juan, null).roleName).toBe('Administrador')
    const asKitchen = toKitchenView(ctx, juan, 'cocina')
    expect(asKitchen.roleName).toBe('Cocina')
    const { can } = buildActiveKitchen(asKitchen)
    expect(can('kitchen.prepare')).toBe(true)
    expect(can('team.manage')).toBe(false)
  })

  it('un rol no asignado (o inventado) se ignora: vuelve al predeterminado', () => {
    expect(toKitchenView(ctx, juan, 'caja').activeRoleId).toBe('admin')
    expect(toKitchenView(ctx, juan, SUPER_ADMIN_ROLE_ID).activeRoleId).toBe('admin')
  })

  it('el SUPER_ADMIN trabaja con acceso total o como uno de sus roles', () => {
    const ana: MyAccountRow = { ...juan, superAdmin: true, defaultRoleId: null, roles: [juan.roles[1]] }
    const full = toKitchenView(ctx, ana, null)
    expect(full.activeRoleId).toBe(SUPER_ADMIN_ROLE_ID)
    expect(full.roleName).toBe('SUPER_ADMIN')
    expect(full.permissions.has('team.manage')).toBe(true)
    expect(full.roleOptions.map((r) => r.name)).toEqual(['SUPER_ADMIN', 'Cocina'])
    expect(toKitchenView(ctx, ana, 'cocina').permissions.has('team.manage')).toBe(false)
  })

  it('muestra la organización de la Cuenta', () => {
    expect(toKitchenView(ctx, juan, null).organizationName).toBe('Grupo XYZ')
  })

  it('el contexto separa el rol de organización, los roles de la Cuenta y las funciones (ADR 0009)', () => {
    const member = buildActiveKitchen(toKitchenView(ctx, juan, null), { organization: ctx.organizations[0] })
    expect(member.organizationRole).toBe('MIEMBRO')
    expect(member.accountRoles.map((r) => r.key)).toEqual(['ADMIN', 'KITCHEN'])
    expect(member.canUseFeature('voice_commands')).toBe(false) // sin cargar: nada se usa

    const ana: MyAccountRow = { ...juan, superAdmin: true, roles: [juan.roles[0]] }
    const owner = buildActiveKitchen(toKitchenView(ctx, ana, null), {
      organization: { ...ctx.organizations[0], isOwner: true, isSuperAdmin: true },
      features: [
        { key: 'voice_commands', category: 'voice', label: '', description: '', usesModel: false, available: true, enabled: true, usable: true, canManage: true, settings: {}, updatedAt: null },
        { key: 'supply_reorder', category: 'ai', label: '', description: '', usesModel: true, available: false, enabled: true, usable: false, canManage: true, settings: {}, updatedAt: null },
      ],
    })
    expect(owner.organizationRole).toBe('SUPER_ADMIN')
    expect(owner.accountRoles.map((r) => r.name)).toEqual(['SUPER_ADMIN', 'Administrador'])
    expect(owner.canUseFeature('voice_commands')).toBe(true)
    expect(owner.canUseFeature('supply_reorder')).toBe(false)
    expect(owner.feature('supply_reorder')?.enabled).toBe(true)
  })

  it('la caché de funciones se separa por Cuenta y rol', () => {
    setActiveKitchenId('k1')
    setActiveRoleId('admin')
    const a = hash(['features'])
    setActiveKitchenId('k2')
    const b = hash(['features'])
    setActiveRoleId('cocina')
    const c = hash(['features'])
    expect(new Set([a, b, c]).size).toBe(3)
  })
})
