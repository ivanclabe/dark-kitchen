import { sharedCookieDomain } from '@/shared/tenant/host'
import { useSyncExternalStore } from 'react'

/**
 * Privacy preferences of this device (ADR 0071, Política de Cookies).
 *
 * - necessary: session, security and what keeps a flow going. Always on (not optional by nature).
 * - preferences: what you chose (theme, voice, kitchen view…). Saved only when you choose it; it can be cleared.
 * - analytics / marketing: none exists today. They start OFF and anything of that kind must load through
 *   `loadScriptWithConsent`, so it stays blocked until the person turns it on.
 */
export type ConsentCategory = 'analytics' | 'marketing'

export interface PrivacyPreferences {
  analytics: boolean
  marketing: boolean
  /** When the person last saved them (null: never chose; everything optional stays off). */
  updatedAt: string | null
}

const KEY = 'dk-consent'
const DEFAULTS: PrivacyPreferences = { analytics: false, marketing: false, updatedAt: null }
const listeners = new Set<() => void>()
let cached: PrivacyPreferences | null = null

function read(): PrivacyPreferences {
  if (cached) return cached
  try {
    const raw = localStorage.getItem(KEY)
    const value = raw ? (JSON.parse(raw) as Partial<PrivacyPreferences>) : {}
    cached = { analytics: value.analytics === true, marketing: value.marketing === true, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null }
  } catch {
    cached = DEFAULTS
  }
  return cached
}

export function getPrivacyPreferences(): PrivacyPreferences {
  return read()
}

export function savePrivacyPreferences(choice: Pick<PrivacyPreferences, ConsentCategory>) {
  cached = { ...choice, updatedAt: new Date().toISOString() }
  try {
    localStorage.setItem(KEY, JSON.stringify(cached))
  } catch {
    // Blocked storage: the choice lasts for this visit only.
  }
  listeners.forEach((l) => l())
}

export function hasConsent(category: ConsentCategory): boolean {
  return read()[category]
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    cached = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function usePrivacyPreferences(): PrivacyPreferences {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS)
}

/**
 * The only way to add an optional third-party script (analytics, pixels…): it loads once the person has
 * accepted that category, and never before. Returns whether it was loaded now.
 */
export function loadScriptWithConsent(category: ConsentCategory, src: string): boolean {
  if (!hasConsent(category) || document.querySelector(`script[src="${CSS.escape(src)}"]`)) return false
  const script = document.createElement('script')
  script.src = src
  script.async = true
  document.head.appendChild(script)
  return true
}

/** Keys of the «preferences» category: removing them only resets choices (theme, voice, views). */
export const PREFERENCE_STORAGE_PREFIXES = ['dk-appearance', 'dk-last-kitchen', 'dk-active-role:', 'dk-kitchen-', 'dk-tip-dismissed', 'dk-help-feedback', 'dk-voice-', 'dk-sidebar-', 'dk-home-']

/** Clears the preferences saved on this device (not the session nor this privacy choice). */
export function clearSavedPreferences(): number {
  let removed = 0
  try {
    for (const key of Object.keys(localStorage)) {
      if (PREFERENCE_STORAGE_PREFIXES.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key)
        removed++
      }
    }
    document.cookie = 'dk-appearance=; Max-Age=0; Path=/'
    const domain = sharedCookieDomain()
    if (domain) document.cookie = `dk-appearance=; Max-Age=0; Path=/; Domain=${domain}`
  } catch {
    // Blocked storage: nothing was saved.
  }
  return removed
}
