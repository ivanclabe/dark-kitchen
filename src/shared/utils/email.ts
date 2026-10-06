/** E-mails (ADR 0039): without spaces, in lowercase, with a user, an @ and a domain with a dot. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmail(value))
}

/** The message under the field, or null when it is fine (an empty optional field is fine). */
export function emailError(value: string, { required = false }: { required?: boolean } = {}): string | null {
  const v = normalizeEmail(value)
  if (!v) return required ? 'Escribe el correo.' : null
  if (!v.includes('@')) return 'Falta la @ del correo.'
  if (!/@[^@\s]+\.[^@\s]+$/.test(v)) return 'Falta el dominio del correo (por ejemplo, @gmail.com).'
  return isValidEmail(v) ? null : 'Revisa el correo: tiene espacios o caracteres de más.'
}
