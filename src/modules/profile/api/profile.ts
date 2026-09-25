import { supabase } from '@/shared/lib/supabase'

/** Cambia el nombre y el avatar propios (dk_update_my_profile: solo el perfil de quien llama). */
export async function updateMyProfile(input: { fullName: string; avatarKey: string | null }): Promise<void> {
  const { error } = await supabase.rpc('dk_update_my_profile', { p_full_name: input.fullName, p_avatar_key: input.avatarKey ?? '' })
  if (error) throw error
}

/**
 * Cambia la contraseña. Antes verifica la actual iniciando sesión con ella:
 * así una sesión abierta en un equipo ajeno no basta para cambiarla.
 */
export async function changeMyPassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (verifyError) throw new Error('La contraseña actual no es correcta')
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
