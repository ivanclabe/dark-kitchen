// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/shared/ui/Toast'
import type { CustomerDetail, CustomerInput } from '../types'

// ADR 0044: persons and companies, the NIT, the preferred mark — and editing never erases the e-mail.
const state = vi.hoisted(() => ({
  perms: ['customers.edit'] as string[],
  created: [] as CustomerInput[],
  updated: [] as { id: string; input: CustomerInput }[],
  failCreate: null as null | { code: string; message: string },
  detail: null as unknown,
}))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/kitchen/activeKitchenContext', () => ({
  useActiveKitchen: () => ({ can: (p: string) => state.perms.includes(p), path: (to: string) => `/k/centro${to}` }),
}))
vi.mock('../api/customers', () => ({
  createCustomer: async (input: CustomerInput) => {
    if (state.failCreate) throw state.failCreate
    state.created.push(input)
    return { id: 'c-new', notes: null, address: null, phone: null, ...input }
  },
  updateCustomer: async (id: string, input: CustomerInput) => void state.updated.push({ id, input }),
  fetchCustomerDetail: async () => state.detail,
  listCustomers: async () => [],
  listCustomersPage: async () => ({ rows: [] }),
  fetchCustomersSummary: async () => ({ total: 0 }),
}))
vi.mock('@/modules/cartera/hooks/useReceivables', () => ({ useCustomerReceivables: () => ({ data: [] }) }))
vi.mock('@/modules/cartera/components/RegisterPaymentModal', () => ({ RegisterPaymentModal: () => null }))

const { CustomerFormModal } = await import('./CreateCustomerModal')
const { CustomerActions } = await import('./CustomerActions')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { MemoryRouter } = await import('react-router-dom')

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.perms = ['customers.edit']
  state.created = []
  state.updated = []
  state.failCreate = null
})
afterEach(cleanup)

describe('customer form (ADR 0044)', () => {
  it('a company: trade name, legal name, NIT, contact and preferred with its reason', async () => {
    const user = userEvent.setup()
    wrap(<CustomerFormModal open onClose={() => undefined} />)
    await user.click(screen.getByRole('radio', { name: 'Empresa' }))
    await user.type(screen.getByRole('textbox', { name: /^Nombre comercial/ }), 'Oficinas Andinas')
    await user.type(screen.getByLabelText('Razón social'), 'Oficinas Andinas S.A.S.')
    await user.type(screen.getByLabelText('NIT'), '900.123.456-7')
    await user.type(screen.getByLabelText('Persona de contacto'), 'Marta Ruiz')
    await user.click(screen.getByRole('switch', { name: 'Cliente preferencial' }))
    await user.type(screen.getByLabelText('Motivo'), 'Convenio corporativo')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))
    await waitFor(() => expect(state.created).toHaveLength(1))
    expect(state.created[0]).toMatchObject({
      fullName: 'Oficinas Andinas',
      type: 'company',
      legalName: 'Oficinas Andinas S.A.S.',
      taxId: '900.123.456-7',
      contactName: 'Marta Ruiz',
      preferred: true,
      preferredNote: 'Convenio corporativo',
    })
  })

  it('a person keeps no company fields, even if typed before switching back', async () => {
    const user = userEvent.setup()
    wrap(<CustomerFormModal open onClose={() => undefined} />)
    await user.click(screen.getByRole('radio', { name: 'Empresa' }))
    await user.type(screen.getByLabelText('Razón social'), 'Algo S.A.S.')
    await user.click(screen.getByRole('radio', { name: 'Persona' }))
    expect(screen.queryByLabelText('Razón social')).toBeNull()
    await user.type(screen.getByLabelText(/^Nombre/), 'Laura Gómez')
    await user.type(screen.getByLabelText('Documento'), '1020304050')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))
    await waitFor(() => expect(state.created).toHaveLength(1))
    expect(state.created[0]).toMatchObject({ type: 'person', legalName: null, contactName: null, taxId: '1020304050', preferred: false, preferredNote: null })
  })

  it('a repeated NIT says so (not «teléfono»)', async () => {
    state.failCreate = { code: '23505', message: 'duplicate key value violates unique constraint "dk_customers_kitchen_tax_id_key"' }
    const user = userEvent.setup()
    wrap(<CustomerFormModal open onClose={() => undefined} />)
    await user.click(screen.getByRole('radio', { name: 'Empresa' }))
    await user.type(screen.getByRole('textbox', { name: /^Nombre comercial/ }), 'Otra')
    await user.type(screen.getByLabelText('NIT'), '9001234567')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect(await screen.findByText(/Ya hay un cliente con ese NIT o documento/)).toBeTruthy()
  })

  it('without customers.edit the preferred mark is not offered', () => {
    state.perms = ['customers.create']
    wrap(<CustomerFormModal open onClose={() => undefined} />)
    expect(screen.queryByRole('switch', { name: 'Cliente preferencial' })).toBeNull()
  })

  it('editing from the list menu keeps the e-mail and the company fields', async () => {
    const detail: CustomerDetail = {
      id: 'c1', fullName: 'Oficinas Andinas', phone: '+573001234567', email: 'compras@andinas.co', address: null, notes: null,
      createdAt: '2026-10-01T00:00:00Z', hasWhatsapp: false, type: 'company', legalName: 'Oficinas Andinas S.A.S.', taxId: '900.123.456-7',
      contactName: 'Marta Ruiz', preferred: true, preferredNote: 'Convenio',
    }
    state.detail = detail
    const user = userEvent.setup()
    wrap(<CustomerActions customer={detail} />)
    await user.click(screen.getByRole('button', { name: 'Acciones de Oficinas Andinas' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    await user.click(await screen.findByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(state.updated).toHaveLength(1))
    expect(state.updated[0].input).toMatchObject({ email: 'compras@andinas.co', type: 'company', legalName: 'Oficinas Andinas S.A.S.', preferred: true, preferredNote: 'Convenio' })
  })
})
