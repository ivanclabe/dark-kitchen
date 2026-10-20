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
/** ADR 0061: «neutral» is the third theme, a warm gray between light and dark. */
export type ThemePreference = 'dark' | 'light' | 'neutral' | 'system'
export type ResolvedTheme = 'dark' | 'light' | 'neutral'

const THEMES: readonly ThemePreference[] = ['dark', 'light', 'neutral', 'system']
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

/**
 * Pages that open in the light theme when the person has not chosen one (ADR 0061): signing in, creating an
 * account (sign-up, activating an invitation, setting a password) and the help center. Keep in sync with the
 * same regular expression in index.html (first paint).
 */
export const LIGHT_DEFAULT_PATH = /^\/(login|registro|activar|set-password|signup-admin|help|legal)(\/|$)/

/** The theme this device chose, or null when it never chose one (then each page has its default). */
export function savedTheme(): ThemePreference | null {
  try {
    const raw = JSON.parse(readCookie() ?? localStorage.getItem(APPEARANCE_KEY) ?? '{}') as Partial<Appearance>
    return THEMES.includes(raw.theme as ThemePreference) ? (raw.theme as ThemePreference) : null
  } catch {
    return null
  }
}

/** The default theme of a page: light on sign-in, account creation and the help center; dark in the app. */
export function defaultThemeFor(pathname: string, docsHost = isDocsHost()): ResolvedTheme {
  return docsHost || LIGHT_DEFAULT_PATH.test(pathname) ? 'light' : 'dark'
}

function isDocsHost(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.startsWith('doc.')
}

/** The page color of each theme: the browser bar on phones follows it (ADR 0065). */
const PAGE_COLOR: Record<ResolvedTheme, string> = { dark: '#0a0a0a', light: '#f5f5f5', neutral: '#f2f0ed' }

function paintBrowserBar(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAGE_COLOR[theme] ?? PAGE_COLOR.dark)
}

/**
 * On every navigation: without a chosen theme, each page shows its default (light on the login, dark once
 * inside the app). A chosen theme is never overridden.
 */
export function applyRouteDefault(pathname: string, root: HTMLElement = document.documentElement) {
  if (savedTheme() !== null) return
  const theme = defaultThemeFor(pathname)
  root.dataset.theme = theme
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  paintBrowserBar(theme)
}

export function readAppearance(): Appearance {
  try {
    const raw = JSON.parse(readCookie() ?? localStorage.getItem(APPEARANCE_KEY) ?? '{}') as Partial<Appearance>
    return {
      theme: THEMES.includes(raw.theme as ThemePreference) ? (raw.theme as ThemePreference) : 'dark',
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
export function resolveTheme(theme: ThemePreference, prefersLight = systemPrefersLight()): ResolvedTheme {
  return theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme
}

export function applyAppearance(appearance: Appearance = readAppearance(), root: HTMLElement = document.documentElement) {
  const theme = resolveTheme(appearance.theme)
  root.dataset.theme = theme
  root.dataset.textSize = appearance.textSize
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  paintBrowserBar(theme)
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
