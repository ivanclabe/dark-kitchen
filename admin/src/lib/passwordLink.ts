import type { PasswordLink } from './api'

/** Text to share the link (WhatsApp, share sheet). */
export function shareMessage(r: PasswordLink): string {
  const first = r.name.trim().split(/\s+/)[0] || 'Hola'
  const what = r.mode === 'activation' ? 'activar tu usuario y crear tu contraseña' : 'crear tu contraseña'
  return `Hola ${first}, este es tu enlace para ${what} en Quanela: ${r.link}\nEs de un solo uso y vence en 1 hora.`
}
