// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ADR 0071: automatic renewal is a separate, express authorization, recorded as evidence before any charge.
const calls = vi.hoisted(() => ({ order: [] as string[], record: vi.fn(), tokenize: vi.fn(), pay: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/legal/api', () => ({
  recordLegalAcceptance: async (input: unknown) => {
    calls.order.push('record')
    calls.record(input)
  },
}))
vi.mock('./billing', async (original) => ({
  ...(await original<typeof import('./billing')>()),
  fetchWompiConfig: async () => ({
    publicKey: 'pub_test',
    apiUrl: 'https://sandbox.wompi.test',
    acceptance: { privacy: { token: 'acc', permalink: 'https://wompi.test/terminos' }, personalData: { token: 'pd', permalink: 'https://wompi.test/datos' } },
  }),
  tokenizeCard: async () => {
    calls.order.push('tokenize')
    calls.tokenize()
    return 'tok_1'
  },
  payWithCard: async () => {
    calls.order.push('pay')
    calls.pay()
    return { charged: true, status: 'APPROVED' }
  },
}))

const { CardPaymentDialog } = await import('./CardPaymentDialog')

afterEach(cleanup)

describe('card payment and automatic renewal (ADR 0071)', () => {
  it('needs the third box; records the authorization (Suscripciones) before tokenizing and charging', async () => {
    const done = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CardPaymentDialog open onClose={() => {}} organizationId="org-1" planKey="business" billingPeriod="monthly" defaultEmail="pagos@prueba.test" onDone={done} />
      </QueryClientProvider>,
    )
    fireEvent.change(await screen.findByLabelText(/Número de la tarjeta/), { target: { value: '4242424242424242' } })
    fireEvent.change(screen.getByLabelText(/Vence/), { target: { value: '1230' } })
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText(/Nombre en la tarjeta/), { target: { value: 'Ana Prueba' } })
    await screen.findByRole('link', { name: /términos y la política de privacidad de Wompi/ })
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    fireEvent.click(boxes[0])
    fireEvent.click(boxes[1])
    fireEvent.click(screen.getByRole('button', { name: 'Pagar y guardar' }))
    expect(await screen.findByText('Para guardar la tarjeta hay que aceptar las tres.')).toBeTruthy()
    expect(calls.record).not.toHaveBeenCalled()

    expect(boxes[2].closest('label')!.textContent).toContain('renovación automática')
    fireEvent.click(boxes[2])
    fireEvent.click(screen.getByRole('button', { name: 'Pagar y guardar' }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(calls.order).toEqual(['record', 'tokenize', 'pay'])
    expect(calls.record.mock.calls[0][0]).toMatchObject({
      context: 'billing_renewal',
      organizationId: 'org-1',
      documents: [{ slug: 'suscripciones' }],
      details: { plan: 'business', billingPeriod: 'monthly', wompiTermsAccepted: true, wompiPersonalDataAccepted: true },
    })
  })
})
