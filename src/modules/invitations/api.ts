import { supabase } from '@/shared/lib/supabase'

export type ActivationStatus = 'valid' | 'expired' | 'used' | 'revoked' | 'organization_inactive'

export interface ActivationPreview {
  organizationName: string
  fullName: string
  email: string
  status: ActivationStatus
  /** La persona ya tiene usuario en la plataforma: inicia sesión en vez de crear contraseña. */
  hasUser: boolean
}

/** Enlace de activación de un usuario creado por un administrador (funciona sin sesión). null = inválido. */
export async function previewActivation(token: string): Promise<ActivationPreview | null> {
  const { data, error } = await supabase.rpc('dk_activation_preview', { p_token: token })
  if (error) throw error
  const row = data[0]
  return row
    ? { organizationName: row.organization_name, fullName: row.full_name, email: row.email, status: row.status as ActivationStatus, hasUser: row.has_user }
    : null
}

/** Activa el usuario con la sesión actual y devuelve el slug de su primera Cuenta. */
export async function acceptActivation(token: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('dk_accept_activation', { p_token: token })
  if (error) throw error
  return data
}
