import type { DocumentRef } from './documents'

/**
 * The two boxes are ticked before the account exists (sign-up with e-mail, Google, Instagram or a phone
 * code, ADR 0071). Until the server can record them, the choice waits in this tab (it survives the trip
 * to Google and back) and travels in the new user's metadata; /registro/confirmado records it.
 */
const KEY = 'dk-legal-consent'
const MAX_AGE_MS = 2 * 60 * 60 * 1000

export interface PreConsent {
  documents: DocumentRef[]
  /** When the boxes were ticked (ISO, from this device): context only; the evidence uses the server's time. */
  at: string
}

export function savePreConsent(documents: DocumentRef[]): PreConsent {
  const value = { documents, at: new Date().toISOString() }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Private mode or storage blocked: the business step asks again.
  }
  return value
}

export function readPreConsent(): PreConsent | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as PreConsent
    if (!Array.isArray(value.documents) || Date.now() - Date.parse(value.at) > MAX_AGE_MS) return null
    return value
  } catch {
    return null
  }
}

export function clearPreConsent() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The consent carried in the user's metadata at sign-up (legal_consent). */
export function preConsentOf(metadata: Record<string, unknown> | undefined): PreConsent | null {
  const value = metadata?.legal_consent as PreConsent | undefined
  return value && Array.isArray(value.documents) && typeof value.at === 'string' ? value : null
}
