import { useSyncExternalStore } from 'react'

/**
 * The welcome intro (ADR 0070): it plays once, right after someone signs in on this page
 * (password, SMS code, sign-up, invitation). Opening the app with a session already open,
 * reloading or a token refresh never plays it. useAuth requests it; BrandIntro shows it.
 */
let requested = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function requestBrandIntro() {
  if (requested) return
  requested = true
  emit()
}

export function finishBrandIntro() {
  if (!requested) return
  requested = false
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBrandIntroRequested(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => requested,
    () => false,
  )
}
