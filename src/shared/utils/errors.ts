/** What the browser says when the network fails (Chrome, Firefox, Safari): never shown raw, it is in English. */
const NETWORK_ERROR = /^(TypeError: )?(Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|Network request failed)$/i
export const NETWORK_ERROR_MESSAGE = 'No pudimos conectarnos con Quanela. Revisa tu conexión e inténtalo de nuevo.'

export function getErrorMessage(err: unknown, fallback: string): string {
  const raw = rawMessage(err)
  if (raw === null) return fallback
  return NETWORK_ERROR.test(raw.trim()) ? NETWORK_ERROR_MESSAGE : raw
}

/**
 * Supabase/PostgREST errors are plain objects with a `message` field, not
 * `Error` instances — `err instanceof Error` misses them and hides the real
 * database error behind a generic fallback.
 */
function rawMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return null
}

/** The database refused a repeated value (a unique key): e.g. two customers with the same phone. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505'
}
