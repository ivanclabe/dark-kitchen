import { supabase } from '@/shared/lib/supabase'
import type { Role } from '@/shared/rbac/roles'
import type { Session, User } from '@supabase/supabase-js'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'

export interface Profile {
  id: string
  fullName: string
  role: Role
  active: boolean
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
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('dk_users')
    .select('id, full_name, role, active')
    .eq('auth_user_id', userId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    fullName: data.full_name,
    role: data.role as Role,
    active: data.active,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        setProfileLoading(true)
        fetchProfile(data.session.user.id)
          .then(setProfile)
          .finally(() => {
            setLoading(false)
            setProfileLoading(false)
          })
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
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
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
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
