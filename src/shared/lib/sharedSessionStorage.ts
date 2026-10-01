/**
 * Supabase Auth storage in first-party cookies on the parent domain
 * (".quanela.com"), so ONE sign-in works on every organization subdomain and
 * switching organization is just navigating (ADR 0021, D3).
 *
 *  - The session is larger than a cookie (4 KB): it is split in parts
 *    "{key}.0", "{key}.1"… and joined back.
 *  - Secure (on https), SameSite=Lax, Path=/, about a year — the same
 *    exposure as localStorage today (readable by our own scripts only).
 *  - Migration: a session still in this origin's localStorage is moved to
 *    the cookie the first time, so nobody is signed out by the change.
 */
export interface SessionStorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const CHUNK = 3000
const MAX_AGE = 400 * 24 * 60 * 60

interface CookieJar {
  read: () => string
  write: (cookie: string) => void
}

const browserJar: CookieJar = {
  read: () => document.cookie,
  write: (cookie) => {
    document.cookie = cookie
  },
}

function cookieNames(jar: CookieJar): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of jar.read().split(';')) {
    const i = part.indexOf('=')
    if (i > 0) map.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
  }
  return map
}

export function createSharedSessionStorage(domain: string, options: { jar?: CookieJar; legacy?: Pick<Storage, 'getItem' | 'removeItem'> | null; secure?: boolean } = {}): SessionStorageLike {
  const jar = options.jar ?? browserJar
  const legacy = options.legacy === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.legacy
  const secure = options.secure ?? (typeof location === 'undefined' || location.protocol === 'https:')
  const attrs = `Domain=${domain}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`

  const parts = (key: string) => {
    const cookies = cookieNames(jar)
    const names = [...cookies.keys()].filter((n) => n.startsWith(`${key}.`) && /^\d+$/.test(n.slice(key.length + 1)))
    return { cookies, names: names.sort((a, b) => Number(a.slice(key.length + 1)) - Number(b.slice(key.length + 1))) }
  }

  function removeItem(key: string) {
    for (const name of parts(key).names) jar.write(`${name}=; Max-Age=0; ${attrs}`)
  }

  function setItem(key: string, value: string) {
    const encoded = encodeURIComponent(value)
    const count = Math.max(1, Math.ceil(encoded.length / CHUNK))
    for (let i = 0; i < count; i++) jar.write(`${key}.${i}=${encoded.slice(i * CHUNK, (i + 1) * CHUNK)}; Max-Age=${MAX_AGE}; ${attrs}`)
    // Parts left over from a longer previous value.
    for (const name of parts(key).names) {
      if (Number(name.slice(key.length + 1)) >= count) jar.write(`${name}=; Max-Age=0; ${attrs}`)
    }
  }

  function getItem(key: string): string | null {
    const { cookies, names } = parts(key)
    if (names.length > 0) {
      try {
        return decodeURIComponent(names.map((n) => cookies.get(n) ?? '').join(''))
      } catch {
        return null
      }
    }
    // First visit after the change: bring the session of this origin along.
    const old = legacy?.getItem(key) ?? null
    if (old) {
      setItem(key, old)
      legacy?.removeItem(key)
    }
    return old
  }

  return { getItem, setItem, removeItem }
}
