// @vitest-environment jsdom
import { PRICING } from '@/test/pricingFixture'
import { ToastProvider } from '@/shared/ui/Toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Pestaña Plan y candados de Funciones (ADR 0010): datos simulados, sin red.
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/plans/usePlans', async (original) => ({
  ...(await original<typeof import('@/shared/plans/usePlans')>()),
  usePublicPricing: () => ({ data: PRICING, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/shared/plans/subscription', async (original) => ({
  ...(await original<typeof import('@/shared/plans/subscription')>()),
  fetchSubscription: async () => ({
    plan: { key: 'standard', name: 'Standard', description: 'Un establecimiento', priceMonthly: 49900, priceYearly: null, currency: 'COP', highlights: ['1 cuenta'], contactUrl: 'mailto:ventas@darkkitchen.co' },
    status: 'trialing',
    isCurrent: true,
    billingPeriod: 'monthly',
    startedAt: new Date().toISOString(),
    trialEndsAt: new Date(Date.now() + 9 * 86_400_000 - 60_000).toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    limits: { accounts: 1, users: 5 },
    usage: { accounts: 1, users: 3 },
    features: ['voice_commands', 'kitchen_stall_alerts'],
  }),
}))
vi.mock('@/shared/features/features', async (original) => ({
  ...(await original<typeof import('@/shared/features/features')>()),
  fetchFeatureMatrix: async () => ({
    plan: { key: 'standard', name: 'Standard' },
    features: [
      { key: 'supply_reorder', category: 'ai', label: 'Sugerencias de compra', description: '', usesModel: true, includedInPlan: false, minPlan: 'Business', available: false },
      { key: 'voice_commands', category: 'voice', label: 'Comandos de voz', description: '', usesModel: false, includedInPlan: true, minPlan: 'Standard', available: true },
    ],
    accounts: [{ id: 'k1', name: 'Taquería Sur', slug: 'sur', iconKey: 'taco', active: true, enabled: { supply_reorder: false, voice_commands: true } }],
  }),
}))

const { PlanPanel } = await import('./PlanPanel')
const { FeaturesPanel } = await import('./FeaturesPanel')

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('pestaña Plan', () => {
  it('muestra plan, prueba, límites y uso', async () => {
    wrap(<PlanPanel organizationId="o1" />)
    expect(await screen.findByRole('heading', { name: /Standard/ })).toBeTruthy()
    expect(screen.getByText(/Tu prueba gratis termina en 9 días/)).toBeTruthy()
    expect(screen.getByText(/de 1 cuenta/)).toBeTruthy()
    expect(screen.getByText('Llegaste al límite de tu plan.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cambiar de plan' }).getAttribute('href')).toBe('mailto:ventas@darkkitchen.co')
    // Funciones del plan con su nombre del catálogo.
    expect(screen.getByText('Comandos de voz')).toBeTruthy()
  })
})

describe('Funciones de la organización', () => {
  it('lo que el plan no incluye va con candado y no se puede activar', async () => {
    wrap(<FeaturesPanel organizationId="o1" />)
    expect(await screen.findByText('Incluida en Business')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Ofrecer Sugerencias de compra en la organización' })).toBeNull()
    expect((screen.getByRole('switch', { name: 'Sugerencias de compra en Taquería Sur' }) as HTMLButtonElement).disabled).toBe(true)
    // Lo incluido sí se administra.
    const voice = screen.getByRole('switch', { name: 'Ofrecer Comandos de voz en la organización' }) as HTMLButtonElement
    expect(voice.disabled).toBe(false)
    expect(voice.getAttribute('aria-checked')).toBe('true')
    expect(within(document.body).getByText(/Tu plan no la incluye/)).toBeTruthy()
  })
})
