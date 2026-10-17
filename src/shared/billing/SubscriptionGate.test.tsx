// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BillingAccess } from './billing'

vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ signOut: vi.fn(), session: { user: { email: 'laura@negocio.co' } } }) }))
const plan = (key: string, name: string, monthly: number, selfServe = true) => ({
  key, name, description: '', badge: null, priceMonthly: monthly, priceYearly: monthly * 10, currency: 'COP', trialDays: 0,
  limits: { accounts: 1, users: 5 }, highlights: [], cta: selfServe ? 'signup' : 'contact_sales', ctaLabel: selfServe ? 'Suscribirme' : 'Hablar con ventas',
  contactUrl: selfServe ? null : 'mailto:ventas@quanela.test', selfServe, sortOrder: 0, features: [],
})
vi.mock('@/shared/plans/usePlans', () => ({
  usePublicPricing: () => ({ data: { plans: [plan('standard', 'Standard', 49900), plan('business', 'Business', 99900), plan('enterprise', 'Enterprise', 249900, false)], features: [] } }),
}))
const startCheckout = vi.fn()
vi.mock('./billing', async (orig) => ({ ...(await orig<typeof import('./billing')>()), startCheckout: (...a: unknown[]) => startCheckout(...a) }))

const { SubscriptionGate } = await import('./SubscriptionGate')

const access = (over: Partial<BillingAccess> = {}): BillingAccess => ({
  organizationId: 'o1', enforced: true, paymentsActive: true, current: false, blocked: true, status: 'incomplete', mode: 'online',
  planKey: 'standard', billingPeriod: 'monthly', currentPeriodEnd: null, graceEndsAt: null, cancelAtPeriodEnd: false,
  canPay: true, openRenewalDue: null, renewalNeedsPayment: false, ...over,
})

function show(a: BillingAccess) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SubscriptionGate access={a} organizationName="Sabor de Laura" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('the subscription gate (ADR 0066)', () => {
  it('who pays: chooses plan and period, sees the total, and both ways to pay', () => {
    show(access())
    expect(screen.getByRole('heading', { name: 'Activa tu suscripción' })).toBeTruthy()
    expect(screen.queryByRole('article', { name: 'Plan Enterprise' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir Business' }))
    fireEvent.click(screen.getByRole('button', { name: /Anual/ }))
    expect(screen.getByText('$999.000 COP')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pagar con tarjeta' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'PSE, Nequi o Bancolombia' }))
    expect(startCheckout).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'o1', planKey: 'business', billingPeriod: 'annual' }))
  })

  it('someone who cannot pay: why, and who can fix it — no payment buttons', () => {
    show(access({ canPay: false, status: 'expired' }))
    expect(screen.getByRole('heading', { name: 'Tu suscripción venció' })).toBeTruthy()
    expect(screen.getByText(/Pídele a quien administra el negocio/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pagar con tarjeta' })).toBeNull()
  })

  it('payments not open yet: talk to Quanela', () => {
    show(access({ paymentsActive: false }))
    expect(screen.getByRole('link', { name: 'Escribir a Quanela' }).getAttribute('href')).toBe('mailto:ventas@quanela.test')
  })

  it('an expired renewal is paid as it is (no plan picker)', () => {
    show(access({ status: 'expired', openRenewalDue: '2026-10-10T13:00:00Z' }))
    expect(screen.queryByRole('button', { name: 'Elegir Business' })).toBeNull()
    expect(screen.getByText(/Renovación vencida el/)).toBeTruthy()
  })
})
