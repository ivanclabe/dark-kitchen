/** The wrong email or password (the login offers «¿Olvidaste tu contraseña?» with it). */
export const INVALID_CREDENTIALS_MESSAGE = 'El correo o la contraseña no son correctos.'

/**
 * Why signing in failed, in plain Spanish — never Supabase's English message
 * («Invalid login credentials»). Read from the error's code first (stable),
 * then its status and text. Used by the app's login and the admin portal's.
 */
export function signInErrorMessage(error: unknown): string {
  const e = (error ?? {}) as { code?: unknown; status?: unknown; message?: unknown; name?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const status = typeof e.status === 'number' ? e.status : null
  const text = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  const name = typeof e.name === 'string' ? e.name : ''

  if (code === 'invalid_credentials' || text.includes('invalid login credentials')) return INVALID_CREDENTIALS_MESSAGE
  if (code === 'email_not_confirmed' || text.includes('email not confirmed')) return 'Todavía no confirmas tu correo: abre el enlace que te enviamos (revisa también el correo no deseado).'
  if (code === 'user_banned' || text.includes('banned')) return 'Este usuario no puede entrar por ahora. Habla con quien administra tu negocio.'
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || status === 429 || text.includes('rate limit') || text.includes('too many'))
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.'
  if (name === 'AuthRetryableFetchError' || text.includes('failed to fetch') || text.includes('network'))
    return 'No pudimos conectarnos. Revisa tu conexión a internet e intenta de nuevo.'
  return 'No pudimos iniciar sesión. Intenta de nuevo en un momento.'
}
