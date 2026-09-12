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
