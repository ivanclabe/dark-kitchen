// @vitest-environment jsdom
import { ToastProvider } from '@/shared/ui/Toast'
import type { FeatureMatrix } from '@/shared/features/features'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ADR 0018 / ADR 0024: AI settings seen from one account: the general values (all your accounts) or this account's own.
const rpc = vi.hoisted(() => ({ org: vi.fn(async () => undefined), account: vi.fn(async () => undefined) }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/features/features', async (original) => ({
  ...(await original<typeof import('@/shared/features/features')>()),
  setOrganizationFeatureSettings: rpc.org,
  setKitchenFeatureSettings: rpc.account,
}))
const { FeatureSettingsSection } = await import('./FeatureSettings')

const feature = {
  key: 'kitchen_stall_alerts', category: 'ai', label: 'Alertas de pedidos detenidos', description: '', usesModel: false, platformActive: true,
  includedInPlan: true, minPlan: 'Standard', available: true, accountOverride: true,
  settings: { dish_stall_min: 12, repeat_min: 5, voice: true }, platformSettings: { dish_stall_min: 12, repeat_min: 5, voice: true }, dependsOn: [],
} as FeatureMatrix['features'][number]

const withOwn = { id: 'k1', name: 'Hamburguesas del Norte', slug: 'norte', iconKey: null, active: true, enabled: {}, customized: ['kitchen_stall_alerts'], overrides: { kitchen_stall_alerts: { dish_stall_min: 3, repeat_min: 1 } } } as unknown as FeatureMatrix['accounts'][number]
const plain = { id: 'k2', name: 'Sopa donde Carmen', slug: 'carmen', iconKey: null, active: true, enabled: {}, customized: [], overrides: {} } as unknown as FeatureMatrix['accounts'][number]

function wrap(account = plain, accountCount = 2) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <FeatureSettingsSection organizationId="o1" feature={feature} account={account} accountCount={accountCount} canEdit onChanged={async () => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Ajustes/ }))
}

describe('AI settings in an account (ADR 0018, ADR 0024)', () => {
  afterEach(() => {
    cleanup()
    rpc.org.mockClear()
    rpc.account.mockClear()
  })

  it('general values apply to all your accounts and save only known fields', async () => {
    wrap()
    expect(screen.getByText(/aplican a todas tus cuentas/)).toBeTruthy()
    const input = screen.getByLabelText('Plato sin avanzar más de')
    expect((input as HTMLInputElement).value).toBe('12')
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar para todas tus cuentas' }))
    await waitFor(() => expect(rpc.org).toHaveBeenCalledWith('o1', 'kitchen_stall_alerts', { dish_stall_min: 15, repeat_min: 5, voice: true }))
  })

  it('does not save an out-of-range value', () => {
    wrap()
    fireEvent.change(screen.getByLabelText('Plato sin avanzar más de'), { target: { value: '1' } })
    expect(screen.getByText('Mínimo 3')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Guardar para todas tus cuentas' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('"Solo esta cuenta" stores only what differs from the general values, for this account', async () => {
    wrap()
    fireEvent.click(screen.getByRole('radio', { name: 'Solo esta cuenta' }))
    fireEvent.change(screen.getByLabelText('Repetir el aviso cada'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar solo para esta cuenta' }))
    await waitFor(() => expect(rpc.account).toHaveBeenCalledWith('k2', 'kitchen_stall_alerts', { repeat_min: 10 }))
    expect(rpc.org).not.toHaveBeenCalled()
  })

  it('an account with its own values shows them and can go back to the general ones', async () => {
    wrap(withOwn)
    expect(screen.getByText('Esta cuenta usa sus propios valores.')).toBeTruthy()
    expect((screen.getByLabelText('Plato sin avanzar más de') as HTMLInputElement).value).toBe('3')
    fireEvent.click(screen.getByRole('button', { name: 'Usar los valores generales' }))
    await waitFor(() => expect(rpc.account).toHaveBeenCalledWith('k1', 'kitchen_stall_alerts', {}))
  })

  it('with a single account there is nothing to choose', () => {
    wrap(plain, 1)
    expect(screen.queryByRole('radio', { name: 'Solo esta cuenta' })).toBeNull()
    expect(screen.queryByText(/todas tus cuentas/)).toBeNull()
  })
})
