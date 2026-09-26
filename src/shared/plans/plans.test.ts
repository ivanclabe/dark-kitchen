import { describe, expect, it } from 'vitest'
// La migración de planes como texto (Vite ?raw): las semillas son la fuente.
import plansSql from '../../../supabase/migrations/20260927100000_dk_plans_subscriptions.sql?raw'
import { formatAmount, formatPlanPrice, hasAnnualBilling, isSelectablePlan, limitLabel, signupPath, type Plan } from './plans'
import { atLimit, trialDaysLeft } from './subscription'

const plan = (over: Partial<Plan>): Plan => ({
  key: 'business',
  name: 'Business',
  description: '',
  badge: 'Más popular',
  priceMonthly: 99900,
  priceYearly: null,
  currency: 'COP',
  trialDays: 14,
  limits: { accounts: 3, users: 15 },
  highlights: [],
  cta: 'signup',
  ctaLabel: 'Comenzar gratis',
  contactUrl: null,
  selfServe: true,
  sortOrder: 20,
  features: [],
  ...over,
})

describe('planes', () => {
  it('las semillas traen los precios aprobados (ADR 0010, D1)', () => {
    for (const [key, price] of [
      ['standard', '49900'],
      ['business', '99900'],
      ['enterprise', '249900'],
    ]) {
      expect(plansSql).toMatch(new RegExp(`\\('${key}', '[^']+', '[^']+', [^,]+, ${price},`))
    }
  })

  it('formatea precios en COP', () => {
    expect(formatAmount(99900)).toBe('$99.900')
    expect(formatPlanPrice(plan({}))).toBe('$99.900 COP/mes')
    expect(formatPlanPrice(plan({}), 'annual')).toBe('$99.900 COP/mes') // sin precio anual, sigue mensual
    expect(formatPlanPrice(plan({ priceYearly: 999000 }), 'annual')).toBe('$999.000 COP/año')
  })

  it('describe límites, incluido "ilimitado"', () => {
    expect(limitLabel(1, 'cuenta', 'cuentas')).toBe('1 cuenta')
    expect(limitLabel(3, 'cuenta', 'cuentas')).toBe('3 cuentas')
    expect(limitLabel(null, 'cuenta', 'cuentas')).toBe('Cuentas ilimitadas')
    expect(limitLabel(null, 'usuario', 'usuarios')).toBe('Usuarios ilimitados')
  })

  it('solo los planes de autoservicio se eligen en el registro', () => {
    const plans = [plan({}), plan({ key: 'enterprise', selfServe: false, cta: 'contact_sales' })]
    expect(isSelectablePlan(plans, 'business')).toBe(true)
    expect(isSelectablePlan(plans, 'enterprise')).toBe(false)
    expect(isSelectablePlan(plans, 'inventado')).toBe(false)
    expect(isSelectablePlan(plans, null)).toBe(false)
    expect(isSelectablePlan(undefined, 'business')).toBe(false)
  })

  it('arma la ruta del registro con el plan', () => {
    expect(signupPath('business')).toBe('/registro?plan=business')
    expect(signupPath(null)).toBe('/registro')
  })

  it('el selector anual solo aparece si algún plan tiene precio anual', () => {
    expect(hasAnnualBilling([plan({})])).toBe(false)
    expect(hasAnnualBilling([plan({}), plan({ priceYearly: 1 })])).toBe(true)
  })

  it('días de prueba y límites', () => {
    const now = Date.parse('2026-10-01T12:00:00Z')
    expect(trialDaysLeft({ status: 'trialing', trialEndsAt: '2026-10-15T12:00:00Z' }, now)).toBe(14)
    expect(trialDaysLeft({ status: 'trialing', trialEndsAt: '2026-09-30T12:00:00Z' }, now)).toBe(0)
    expect(trialDaysLeft({ status: 'active', trialEndsAt: null }, now)).toBeNull()
    expect(atLimit(3, 3)).toBe(true)
    expect(atLimit(2, 3)).toBe(false)
    expect(atLimit(99, null)).toBe(false)
  })
})
