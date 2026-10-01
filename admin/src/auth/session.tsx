import type { Session } from '@supabase/supabase-js'
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Global Admin session (ADR 0019). The steps are decided with the database,
 * never with the screen alone:
 *   signed_out → (password) → role check (dk_ga_me) → restricted | second factor
 *   second factor: enroll a TOTP the first time, then verify → ready (aal2)
 * Every portal query also requires role + aal2 in the database.
 */
export type AdminStage = 'loading' | 'signed_out' | 'restricted' | 'mfa_enroll' | 'mfa_verify' | 'ready'

interface Me {
  email: string
  fullName: string | null
}

interface AdminSession {
  stage: AdminStage
  session: Session | null
  me: Me | null
  /** Email of a signed-in account that is not a Global Admin (shown, then signed out). */
  restrictedEmail: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AdminSession | null>(null)

async function resolveStage(session: Session | null): Promise<{ stage: AdminStage; me: Me | null; restrictedEmail: string | null }> {
  if (!session) return { stage: 'signed_out', me: null, restrictedEmail: null }
  const { data: me, error } = await supabase.rpc('dk_ga_me')
  const info = (me ?? {}) as { email?: string; isGlobalAdmin?: boolean; fullName?: string | null }
  if (error || !info.isGlobalAdmin) {
    // A valid Quanela account is not enough: leave at once (this device only).
    const email = info.email ?? session.user.email ?? null
    await supabase.auth.signOut({ scope: 'local' })
    return { stage: 'restricted', me: null, restrictedEmail: email }
  }
  const profile = { email: info.email ?? session.user.email ?? '', fullName: info.fullName ?? null }
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel === 'aal2') return { stage: 'ready', me: profile, restrictedEmail: null }
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verified = factors?.totp.some((f) => f.status === 'verified')
  return { stage: verified ? 'mfa_verify' : 'mfa_enroll', me: profile, restrictedEmail: null }
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ stage: AdminStage; session: Session | null; me: Me | null; restrictedEmail: string | null }>({
    stage: 'loading',
    session: null,
    me: null,
    restrictedEmail: null,
  })

  const apply = useCallback(async (session: Session | null) => {
    const next = await resolveStage(session)
    setState((prev) => ({
      session: next.stage === 'restricted' ? null : session,
      ...next,
      // Keep the "restricted" message after the local sign-out that follows it.
      ...(next.stage === 'signed_out' && prev.stage === 'restricted' ? { stage: 'restricted' as const, restrictedEmail: prev.restrictedEmail } : {}),
    }))
  }, [])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) void apply(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      // Defer: calling Supabase inside the callback can deadlock its auth lock.
      setTimeout(() => void apply(session), 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [apply])

  const value: AdminSession = {
    ...state,
    refresh: async () => {
      const { data } = await supabase.auth.getSession()
      await apply(data.session)
    },
    // This portal only: Quanela keeps its own session.
    signOut: async () => {
      await supabase.auth.signOut({ scope: 'local' })
      setState({ stage: 'signed_out', session: null, me: null, restrictedEmail: null })
    },
  }
  return <Ctx value={value}>{children}</Ctx>
}

export function useAdminSession(): AdminSession {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useAdminSession must be used within AdminSessionProvider')
  return ctx
}
