// @vitest-environment jsdom
import { AuthApiError, AuthSessionMissingError } from '@supabase/supabase-js'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The session on this device is only trusted after Supabase Auth confirms it (getUser), and
// signing out leaves nothing of the previous person in memory.
const sb = vi.hoisted(() => ({
  stored: null as null | { user: { id: string; email: string } },
  getUserError: null as unknown,
  signOutError: null as unknown,
  listener: null as null | ((event: string, session: unknown) => void),
  signOut: vi.fn(),
}))
vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: sb.stored } })),
      getUser: vi.fn(async () => ({ data: { user: sb.stored?.user ?? null }, error: sb.getUserError })),
      signOut: vi.fn(async () => {
        sb.signOut()
        if (!sb.signOutError) sb.stored = null
        return { error: sb.signOutError }
      }),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        sb.listener = cb
        return { data: { subscription: { unsubscribe: () => undefined } } }
      }),
      signInWithPassword: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'p1', full_name: 'Laura Gómez', avatar_key: null, active: true, platform_role: null }, error: null }) }) }) }),
    rpc: vi.fn(async () => ({})),
  },
}))

const { AuthProvider, useAuth } = await import('./useAuth')
const { queryClient } = await import('@/shared/lib/queryClient')
const { getActiveKitchenId, setActiveKitchenId } = await import('@/shared/kitchen/activeKitchen')
const { finishBrandIntro, useBrandIntroRequested } = await import('@/shared/brand/brandIntroState')

const probe: { api: ReturnType<typeof useAuth> | null } = { api: null }
function Probe() {
  const auth = useAuth()
  useEffect(() => {
    probe.api = auth
  })
  return <p data-testid="state">{auth.loading ? 'cargando' : auth.session ? `con sesión ${auth.profile?.fullName ?? ''}` : 'sin sesión'}</p>
}
const state = () => screen.getByTestId('state').textContent
function IntroProbe() {
  return <p data-testid="intro">{useBrandIntroRequested() ? 'bienvenida' : 'nada'}</p>
}
const intro = () => screen.getByTestId('intro').textContent

beforeEach(() => {
  sb.stored = { user: { id: 'u1', email: 'laura@negocio.co' } }
  sb.getUserError = null
  sb.signOutError = null
  sb.signOut.mockClear()
})
afterEach(() => {
  cleanup()
  finishBrandIntro()
})

describe('the session (useAuth)', () => {
  it('a stored session confirmed by Supabase is shown, with its profile', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(state()).toBe('cargando')
    await waitFor(() => expect(state()).toBe('con sesión Laura Gómez'))
  })

  it('a stored session the server rejects (revoked, user deleted) is closed on this device', async () => {
    sb.getUserError = new AuthApiError('User from sub claim in JWT does not exist', 403, 'user_not_found')
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(state()).toBe('sin sesión'))
    expect(sb.signOut).toHaveBeenCalledOnce()
  })

  it('a missing session is not shown either', async () => {
    sb.getUserError = new AuthSessionMissingError()
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(state()).toBe('sin sesión'))
  })

  it('without connection the stored session stays (the app works offline as before)', async () => {
    sb.getUserError = new Error('Failed to fetch')
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(state()).toBe('con sesión Laura Gómez'))
    expect(sb.signOut).not.toHaveBeenCalled()
  })

  it('signing out forgets cached data and the active account', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(state()).toBe('con sesión Laura Gómez'))
    queryClient.setQueryData(['my-kitchens'], { secret: 'de Laura' })
    setActiveKitchenId('k1')
    let result: { error: string | null } | undefined
    await act(async () => {
      result = await probe.api!.signOut()
    })
    expect(result).toEqual({ error: null })
    expect(state()).toBe('sin sesión')
    expect(queryClient.getQueryData(['my-kitchens'])).toBeUndefined()
    expect(getActiveKitchenId()).toBeNull()
  })

  it('if the device could not be signed out, it says so and keeps the session', async () => {
    sb.signOutError = new Error('Failed to fetch')
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(state()).toBe('con sesión Laura Gómez'))
    let result: { error: string | null } | undefined
    await act(async () => {
      result = await probe.api!.signOut()
    })
    expect(result?.error).toContain('No pudimos cerrar la sesión')
    expect(state()).toBe('con sesión Laura Gómez')
  })

  it('another person signing in (another tab) also clears what the previous one left', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(state()).toBe('con sesión Laura Gómez'))
    queryClient.setQueryData(['my-kitchens'], { secret: 'de Laura' })
    act(() => sb.listener?.('SIGNED_IN', { user: { id: 'u2', email: 'otra@negocio.co' } }))
    expect(queryClient.getQueryData(['my-kitchens'])).toBeUndefined()
  })

  it('the welcome intro plays when someone signs in here, never for a session that was already open (ADR 0070)', async () => {
    sb.stored = null
    render(<AuthProvider><Probe /><IntroProbe /></AuthProvider>)
    await waitFor(() => expect(state()).toBe('sin sesión'))
    expect(intro()).toBe('nada')
    act(() => sb.listener?.('SIGNED_IN', { user: { id: 'u1', email: 'laura@negocio.co' } }))
    expect(intro()).toBe('bienvenida')
  })

  it('reopening the app, a token refresh or a tab coming back does not replay it', async () => {
    render(<AuthProvider><Probe /><IntroProbe /></AuthProvider>)
    await waitFor(() => expect(state()).toBe('con sesión Laura Gómez'))
    act(() => sb.listener?.('TOKEN_REFRESHED', { user: { id: 'u1', email: 'laura@negocio.co' } }))
    act(() => sb.listener?.('SIGNED_IN', { user: { id: 'u1', email: 'laura@negocio.co' } }))
    expect(intro()).toBe('nada')
  })
})
