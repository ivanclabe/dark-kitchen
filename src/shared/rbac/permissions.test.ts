import { describe, expect, it } from 'vitest'
// La suite SQL como texto (Vite ?raw): ahí está la lista que se compara contra dk_permissions.
import catalogSuite from '../../../supabase/tests/permission_catalog.sql?raw'
import { ACCOUNT_PERMISSION_KEYS, ORGANIZATION_PERMISSION_KEYS } from './permissions'

describe('catálogo de permisos de la app', () => {
  it('es idéntico a la lista que la suite SQL compara contra la base', () => {
    // supabase/tests/permission_catalog.sql verifica que esta misma lista coincida con dk_permissions.
    const block = catalogSuite.slice(catalogSuite.indexOf('-- app-keys:begin'), catalogSuite.indexOf('-- app-keys:end'))
    const sqlKeys = [...block.matchAll(/\('([a-z_]+\.[a-z_]+)'\)/g)].map((m) => m[1])
    expect(sqlKeys.sort()).toEqual([...ACCOUNT_PERMISSION_KEYS, ...ORGANIZATION_PERMISSION_KEYS].sort())
  })

  it('tiene 47 permisos de Cuenta y 10 de organización, sin repetidos y con formato módulo.acción', () => {
    const all = [...ACCOUNT_PERMISSION_KEYS, ...ORGANIZATION_PERMISSION_KEYS]
    expect(ACCOUNT_PERMISSION_KEYS).toHaveLength(47)
    expect(ORGANIZATION_PERMISSION_KEYS).toHaveLength(10)
    expect(new Set(all).size).toBe(all.length)
    for (const key of all) expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/)
  })
})
