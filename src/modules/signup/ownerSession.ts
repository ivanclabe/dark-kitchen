import { fetchMyContext } from '@/shared/kitchen/kitchensApi'

/**
 * ADR 0025, D3: Google, Instagram and phone are for owners. Before leaving for
 * the provider (or verifying the SMS code) the app leaves a mark in this tab;
 * on return, a person who already has a profile but owns no business (an
 * invited user whose email Supabase linked to Google) is asked to sign in with
 * email and password instead.
 */
const MARK = 'dk-owner-sign-in'

export function markOwnerSignIn(): void {
  try {
    sessionStorage.setItem(MARK, String(Date.now()))
  } catch {
    // Without storage the guard simply does not run.
  }
}

export function hasOwnerSignInMark(): boolean {
  try {
    return sessionStorage.getItem(MARK) !== null
  } catch {
    return false
  }
}

export function takeOwnerSignInMark(): boolean {
  try {
    const value = sessionStorage.getItem(MARK)
    sessionStorage.removeItem(MARK)
    return value !== null
  } catch {
    return false
  }
}

/** Does this person own a business? (the only ones these methods are for). */
export async function ownsABusiness(): Promise<boolean> {
  const ctx = await fetchMyContext()
  return ctx?.organizations.some((o) => o.isOwner) ?? false
}

export const NOT_AN_OWNER_NOTICE = 'Esa forma de entrar es para quien creó su negocio en Quanela. Entra con tu correo y tu contraseña.'
