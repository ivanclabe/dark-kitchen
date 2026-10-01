// @vitest-environment jsdom
import { ToastProvider } from '@/shared/ui/Toast'
import type { FeatureMatrix } from '@/shared/features/features'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ADR 0018: AI settings are the organization's, with exceptions per account.
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

const accounts = [
  { id: 'k1', name: 'Hamburguesas del Norte', slug: 'norte', iconKey: null, active: true, enabled: {}, customized: ['kitchen_stall_alerts'], overrides: { kitchen_stall_alerts: { dish_stall_min: 3, repeat_min: 1 } } },
  { id: 'k2', name: 'Sopa donde Carmen', slug: 'carmen', iconKey: null, active: true, enabled: {}, customized: [], overrides: {} },
] as unknown as FeatureMatrix['accounts']

function wrap() {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <FeatureSettingsSection organizationId="o1" feature={feature} accounts={accounts} canEdit onChanged={async () => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Ajustes/ }))
}

describe('organization AI settings (ADR 0018)', () => {
  afterEach(() => {
    cleanup()
    rpc.org.mockClear()
    rpc.account.mockClear()
  })

  it('shows the organization values and saves only known fields', async () => {
    wrap()
    const input = screen.getByLabelText('Plato sin avanzar más de')
    expect((input as HTMLInputElement).value).toBe('12')
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(rpc.org).toHaveBeenCalledWith('o1', 'kitchen_stall_alerts', { dish_stall_min: 15, repeat_min: 5, voice: true }))
  })

  it('does not save an out-of-range value', () => {
    wrap()
    fireEvent.change(screen.getByLabelText('Plato sin avanzar más de'), { target: { value: '1' } })
    expect(screen.getByText('Mínimo 3')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists the account exception and removes it', async () => {
    wrap()
    expect(screen.getByText('Hamburguesas del Norte')).toBeTruthy()
    expect(screen.getByText('3 min · 1 min')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(rpc.account).toHaveBeenCalledWith('k1', 'kitchen_stall_alerts', {}))
  })

  it('a new exception stores only what differs from the organization', async () => {
    wrap()
    fireEvent.change(screen.getByLabelText(/Agregar una excepción/), { target: { value: 'k2' } })
    const inputs = screen.getAllByLabelText('Repetir el aviso cada')
    fireEvent.change(inputs[inputs.length - 1], { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar excepción' }))
    await waitFor(() => expect(rpc.account).toHaveBeenCalledWith('k2', 'kitchen_stall_alerts', { repeat_min: 10 }))
  })
})
