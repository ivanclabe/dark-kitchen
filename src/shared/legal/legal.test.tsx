// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ADR 0071: the acceptance gate, the business's policy, and optional scripts blocked without consent.
const state = vi.hoisted(() => ({
  pending: [] as { slug: string; version: string; title: string; effectiveDate: string; reason: string }[],
  metadata: {} as Record<string, unknown>,
  record: vi.fn(async (_input: unknown) => undefined),
}))
vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'u1', user_metadata: state.metadata } }, signOut: vi.fn() }),
}))
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  fetchPendingLegalDocuments: async () => state.pending,
  recordLegalAcceptance: state.record,
}))

const { LegalAcceptanceGate } = await import('./LegalAcceptanceGate')
const { legalDocument, kitchenPolicyHtml } = await import('./documents')
const { loadScriptWithConsent, savePrivacyPreferences } = await import('./privacyPreferences')

const terms = legalDocument('terminos')!
const privacy = legalDocument('privacidad')!
const pendingBoth = () => [
  { slug: 'privacidad', version: privacy.version, title: privacy.title, effectiveDate: privacy.effective, reason: 'first' },
  { slug: 'terminos', version: terms.version, title: terms.title, effectiveDate: terms.effective, reason: 'first' },
]

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LegalAcceptanceGate>
        <p>La app</p>
      </LegalAcceptanceGate>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.pending = []
  state.metadata = {}
  state.record.mockClear()
  sessionStorage.clear()
  localStorage.clear()
})
afterEach(cleanup)

describe('acceptance gate (ADR 0071)', () => {
  it('nothing pending: the app', async () => {
    renderGate()
    expect(await screen.findByText('La app')).toBeTruthy()
  })

  it('pending: one unticked box per document, Terms first; accepting records them as app_gate', async () => {
    state.pending = pendingBoth()
    renderGate()
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([false, false])
    expect(boxes[0].closest('label')!.textContent).toContain('Términos y Condiciones')
    expect(screen.queryByText('La app')).toBeNull()
    const accept = screen.getByRole('button', { name: 'Aceptar y continuar' }) as HTMLButtonElement
    fireEvent.click(boxes[0])
    expect(accept.disabled).toBe(true)
    fireEvent.click(boxes[1])
    expect(accept.disabled).toBe(false)
    fireEvent.click(accept)
    await waitFor(() => expect(state.record).toHaveBeenCalledOnce())
    expect(state.record.mock.calls[0][0]).toMatchObject({
      context: 'app_gate',
      documents: [
        { slug: 'terminos', version: terms.version },
        { slug: 'privacidad', version: privacy.version },
      ],
    })
  })

  it('ticked at sign-up (same versions) but not recorded yet: recorded as signup without asking again', async () => {
    state.pending = pendingBoth()
    state.metadata = { legal_consent: { documents: [{ slug: 'terminos', version: terms.version }, { slug: 'privacidad', version: privacy.version }], at: new Date().toISOString() } }
    renderGate()
    await waitFor(() => expect(state.record).toHaveBeenCalledOnce())
    expect(state.record.mock.calls[0][0]).toMatchObject({ context: 'signup' })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('a version the page does not know (newer text): reload before accepting', async () => {
    state.pending = [{ slug: 'terminos', version: '9.9', title: terms.title, effectiveDate: terms.effective, reason: 'new_version' }]
    renderGate()
    expect(await screen.findByRole('button', { name: 'Recargar' })).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('the page is newer than the server (published before its migration): never a reload loop, it lets the person in', async () => {
    state.pending = [{ slug: 'terminos', version: '0.9', title: terms.title, effectiveDate: terms.effective, reason: 'first' }]
    renderGate()
    expect(await screen.findByText('La app')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Recargar' })).toBeNull()
    expect(state.record).not.toHaveBeenCalled()
  })
})

describe('the business policy and optional scripts (ADR 0071)', () => {
  it('fills the business data escaped, and says what it has not published', () => {
    const html = kitchenPolicyHtml('<p><span data-kitchen="nombre"></span> · <span data-kitchen="nit"></span></p>', {
      name: '<b>Sopas</b>',
      legalName: null,
      taxId: null,
      phone: null,
      address: null,
      city: null,
    })
    expect(html).toContain('&lt;b&gt;Sopas&lt;/b&gt;')
    expect(html).toContain('(no publicado por el negocio)')
  })

  it('an analytics script never loads before the person allows it', () => {
    expect(loadScriptWithConsent('analytics', 'https://example.test/a.js')).toBe(false)
    expect(document.querySelector('script[src="https://example.test/a.js"]')).toBeNull()
    savePrivacyPreferences({ analytics: true, marketing: false })
    expect(loadScriptWithConsent('analytics', 'https://example.test/a.js')).toBe(true)
    expect(loadScriptWithConsent('marketing', 'https://example.test/m.js')).toBe(false)
  })
})
