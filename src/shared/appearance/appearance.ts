import { sharedCookieDomain } from '@/shared/tenant/host'
import { useSyncExternalStore } from 'react'

/**
 * Apariencia de ESTE equipo (ADR 0023, D2): tema y tamaño del texto. Se
 * guarda por dispositivo (las tablets de cocina son compartidas) y se aplica
 * en <html> como data-theme / data-text-size. index.html la aplica antes
 * del primer pintado para que no haya destello.
 *
 * localStorage es por origen, y cada organización tiene su subdominio
 * (ADR 0021/0022): con dominio raíz real también se guarda en una cookie de
 * ".quanela.com", así el equipo se ve igual en quanela.com y en todas sus
 * organizaciones.
 */
export type ThemePreference = 'dark' | 'light' | 'system'
export type TextSize = 'normal' | 'large'

export interface Appearance {
  theme: ThemePreference
  textSize: TextSize
}

export const APPEARANCE_KEY = 'dk-appearance'
const EVENT = 'dk-appearance'
const DEFAULTS: Appearance = { theme: 'dark', textSize: 'normal' }

function readCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${APPEARANCE_KEY}=`))
  return match ? decodeURIComponent(match.slice(APPEARANCE_KEY.length + 1)) : null
}

export function readAppearance(): Appearance {
  try {
    const raw = JSON.parse(readCookie() ?? localStorage.getItem(APPEARANCE_KEY) ?? '{}') as Partial<Appearance>
    return {
      theme: raw.theme === 'light' || raw.theme === 'system' ? raw.theme : 'dark',
      textSize: raw.textSize === 'large' ? 'large' : 'normal',
    }
  } catch {
    return DEFAULTS
  }
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches
}

/** The theme actually shown ("system" follows the operating system). */
export function resolveTheme(theme: ThemePreference, prefersLight = systemPrefersLight()): 'dark' | 'light' {
  return theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme
}

export function applyAppearance(appearance: Appearance = readAppearance(), root: HTMLElement = document.documentElement) {
  const theme = resolveTheme(appearance.theme)
  root.dataset.theme = theme
  root.dataset.textSize = appearance.textSize
  root.style.colorScheme = theme
}

export function saveAppearance(change: Partial<Appearance>) {
  const next = { ...readAppearance(), ...change }
  const value = JSON.stringify(next)
  try {
    localStorage.setItem(APPEARANCE_KEY, value)
  } catch {
    // Storage blocked: it applies until the page reloads.
  }
  const domain = sharedCookieDomain()
  if (domain) {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${APPEARANCE_KEY}=${encodeURIComponent(value)}; Domain=${domain}; Path=/; Max-Age=${400 * 24 * 60 * 60}; SameSite=Lax${secure}`
  }
  applyAppearance(next)
  cache = next
  window.dispatchEvent(new Event(EVENT))
}

let cache: Appearance | null = null
function snapshot(): Appearance {
  cache ??= readAppearance()
  return cache
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== APPEARANCE_KEY) return
    cache = readAppearance()
    applyAppearance(cache)
    callback()
  }
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', onStorage)
  // "Según el sistema" follows the operating system while the app is open.
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null
  const onSystem = () => applyAppearance(snapshot())
  mq?.addEventListener('change', onSystem)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', onStorage)
    mq?.removeEventListener('change', onSystem)
  }
}

export function useAppearance(): [Appearance, (change: Partial<Appearance>) => void] {
  const value = useSyncExternalStore(subscribe, snapshot, () => DEFAULTS)
  return [value, saveAppearance]
}
