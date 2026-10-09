/**
 * ADR 0043: right after signing in, a person with several accounts chooses
 * which one to work in («Tus cuentas») instead of landing in the last one.
 * The app tells «just signed in» from «opened the app with the session
 * already open» with a mark in this tab: set when signing in (or right before
 * leaving for Google or Instagram), read by the entry, cleared there. It
 * expires so an abandoned sign-in never surprises later.
 */
const MARK = 'dk-choose-account'
export const ACCOUNT_CHOICE_TTL_MS = 10 * 60_000

export function markAccountChoice(now = Date.now()): void {
  try {
    sessionStorage.setItem(MARK, String(now))
  } catch {
    // Without storage the person simply lands in the last account, as before.
  }
}

/** True while a fresh sign-in is waiting for the entry to decide (not yet expired). */
export function pendingAccountChoice(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(MARK))
    return at > 0 && now - at < ACCOUNT_CHOICE_TTL_MS
  } catch {
    return false
  }
}

export function clearAccountChoice(): void {
  try {
    sessionStorage.removeItem(MARK)
  } catch {
    // Nothing to clear.
  }
}
