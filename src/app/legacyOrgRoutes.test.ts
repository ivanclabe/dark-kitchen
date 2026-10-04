import { describe, expect, it } from 'vitest'
import { accountPathForOrgSection } from './legacyOrgRoutes'

// ADR 0024: the /o/{slug}/… addresses only redirect, each to its equivalent inside an account.
describe('old organization addresses', () => {
  it.each([
    ['', '/'],
    ['equipos', '/users'],
    ['facturacion', '/settings/billing'],
    ['ai?tab=usage', '/settings/ai'],
    ['configuracion', '/settings/general'],
    ['observabilidad?tab=bitacora&cuenta=x', '/settings/activity'],
    ['menus-maestros', '/menu-planner?view=shared'],
    ['algo-que-no-existe', '/'],
  ])('/o/{slug}/%s → %s', (rest, expected) => {
    expect(accountPathForOrgSection(rest)).toBe(expected)
  })

  it('/o/{slug}/cuentas → "Tus cuentas"', () => {
    expect(accountPathForOrgSection('cuentas')).toBeNull()
  })
})
