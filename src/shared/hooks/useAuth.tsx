import { signInErrorMessage } from '@/shared/utils/authErrors'
import { clearAccountChoice } from '@/shared/kitchen/accountChoice'
import { setActiveKitchenId, setActiveRoleId } from '@/shared/kitchen/activeKitchen'
import { queryClient } from '@/shared/lib/queryClient'
import { supabase } from '@/shared/lib/supabase'
import { isAuthApiError, isAuthSessionMissingError, type Session, type User } from '@supabase/supabase-js'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'

export interface Profile {
  id: string
  fullName: string
  /** Avatar prediseñado elegido (null = el derivado del id). */
  avatarKey: string | null
  active: boolean
  /** Superusuario de la plataforma (crea y administra todas las Cocinas). El rol de cada Cocina vive en su membresía. */
  isSuperadmin: boolean
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** Resolving the initial session. */
  loading: boolean
  /** Fetching (or re-fetching) the dk_users profile row for the current session. */
  profileLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  /**
   * Closes the session on this device (the Global Admin portal keeps its own) and clears what the
   * app kept of it. `error` when the device could not be signed out (no connection): it stays signed in.
   */
  signOut: () => Promise<{ error: string | null }>
  /** Vuelve a leer el perfil (p. ej. justo después de aceptar una invitación, que lo crea). */
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('dk_users')
    .select('id, full_name, avatar_key, active, platform_role')
    .eq('auth_user_id', userId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    fullName: data.full_name,
    avatarKey: data.avatar_key,
    active: data.active,
    isSuperadmin: data.platform_role === 'SUPERADMIN',
  }
}

/**
 * Is the stored session still valid for Supabase Auth? getSession() only reads this
 * device (cookie or localStorage); getUser() asks the server. A revoked session or a
 * deleted user is 'invalid'; without connection it is 'unknown' and the session stays.
 */
async function verifySession(): Promise<'valid' | 'invalid' | 'unknown'> {
  const { error } = await supabase.auth.getUser()
  if (!error) return 'valid'
  if (isAuthSessionMissingError(error)) return 'invalid'
  if (isAuthApiError(error) && [401, 403, 404].includes(error.status ?? 0)) return 'invalid'
  return 'unknown'
}

/** Nothing of the previous person stays in memory: cached data, active account and role. */
function forgetAppState() {
  setActiveKitchenId(null)
  setActiveRoleId(null)
  clearAccountChoice()
  queryClient.clear()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    let lastUserId: string | null = null
    // The stored session is checked with the server before anything shows it as valid
    // (landing included); its profile is read at the same time, so the start is not slower.
    supabase.auth.getSession().then(async ({ data }) => {
      const stored = data.session
      if (!stored) {
        setLoading(false)
        return
      }
      setProfileLoading(true)
      const [check, storedProfile] = await Promise.all([verifySession(), fetchProfile(stored.user.id)])
      if (check === 'invalid') {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
        forgetAppState()
      } else {
        lastUserId = stored.user.id
        setSession(stored)
        setProfile(storedProfile)
      }
      setLoading(false)
      setProfileLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // The first one is the stored session: the start above verifies it.
      if (event === 'INITIAL_SESSION') return
      // Signed out (here or in another tab), or another person signed in: nothing of before stays.
      if (event === 'SIGNED_OUT' || (newSession && lastUserId && newSession.user.id !== lastUserId)) forgetAppState()
      lastUserId = newSession?.user.id ?? null
      setSession(newSession)
      // Bitácora (ADR 0012): el inicio de sesión lo registra la base (1 por minuto como mucho).
      if (event === 'SIGNED_IN' && newSession) void supabase.rpc('dk_log_sign_in').then(() => undefined, () => undefined)
      if (newSession) {
        setProfileLoading(true)
        fetchProfile(newSession.user.id)
          .then(setProfile)
          .finally(() => setProfileLoading(false))
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // Never Supabase's English text: what happened, in plain Spanish.
    return { error: error ? signInErrorMessage(error) : null }
  }

  async function signOut(): Promise<{ error: string | null }> {
    // Only this app on this device: the Global Admin portal keeps its own session (ADR 0019).
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      // Without connection the server is not told, but the session must still be gone from this device.
      const { data } = await supabase.auth.getSession()
      if (data.session) return { error: 'No pudimos cerrar la sesión. Revisa tu conexión e inténtalo de nuevo.' }
    }
    forgetAppState()
    setSession(null)
    setProfile(null)
    return { error: null }
  }

  async function refreshProfile() {
    // La sesión del estado puede no haberse actualizado aún (p. ej. justo después de signUp): se lee la actual.
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    setProfile(await fetchProfile(data.session.user.id))
  }

  return (
    <AuthContext
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileLoading,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext>
  )
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
