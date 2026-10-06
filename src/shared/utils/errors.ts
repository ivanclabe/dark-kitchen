/**
 * Supabase/PostgREST errors are plain objects with a `message` field, not
 * `Error` instances — `err instanceof Error` misses them and hides the real
 * database error behind a generic fallback.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message
  }
  return fallback
}

/** The database refused a repeated value (a unique key): e.g. two customers with the same phone. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505'
}
