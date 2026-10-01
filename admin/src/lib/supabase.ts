import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.')

/**
 * The Global Admin portal's own Supabase client (ADR 0019). Its session lives
 * under its own key (and, deployed, on its own domain), so signing in or out
 * of Quanela never affects it and vice versa. It never sends account headers:
 * the portal works above organizations. Every module that imports
 * '@/shared/lib/supabase' gets this client inside the portal (Vite alias).
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { storageKey: 'quanela-global-admin', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Same name as Quanela's export, for reused modules; no account headers here. */
export const kitchenAwareFetch: typeof fetch = (input, init) => fetch(input, init)
