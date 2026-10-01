// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminStage } from './auth/session'

// ADR 0019: nothing of the portal renders until role + second factor are confirmed.
const state = vi.hoisted(() => ({ stage: 'signed_out' as AdminStage }))
vi.mock('./auth/session', () => ({
  AdminSessionProvider: ({ children }: { children: ReactNode }) => children,
  useAdminSession: () => ({ stage: state.stage, session: null, me: { email: 'admin@quanela.test', fullName: 'Admin' }, restrictedEmail: 'otra@quanela.test', refresh: vi.fn(), signOut: vi.fn() }),
}))
vi.mock('./lib/supabase', () => ({
  supabase: {
    rpc: () => new Promise(() => {}),
    auth: { mfa: { enroll: () => new Promise(() => {}), listFactors: () => new Promise(() => {}) } },
  },
}))
const { App } = await import('./App')

afterEach(cleanup)

describe('portal gate', () => {
  it.each<AdminStage>(['signed_out', 'restricted', 'mfa_enroll', 'mfa_verify'])('shows only the sign-in screen while %s', (stage) => {
    state.stage = stage
    render(<App />)
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull()
    expect(screen.getByText(/ACCESO RESTRINGIDO/)).toBeTruthy()
  })

  it('opens the console once ready (aal2)', async () => {
    state.stage = 'ready'
    render(<App />)
    expect((await screen.findAllByRole('navigation', { name: 'Secciones' })).length).toBeGreaterThan(0)
    expect(screen.queryByText(/ACCESO RESTRINGIDO/)).toBeNull()
  })
})
