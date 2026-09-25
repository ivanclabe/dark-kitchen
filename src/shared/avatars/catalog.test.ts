import { describe, expect, it } from 'vitest'
// La migración con los CHECK de ambas galerías, como texto (Vite ?raw).
import galleriesSql from '../../../supabase/migrations/20260926100000_dk_account_icons_person_avatars.sql?raw'
import {
  ACCOUNT_ICON_KEYS,
  ACCOUNT_ICON_LABELS,
  ACCOUNT_ICONS,
  AVATAR_KEYS,
  AVATAR_LABELS,
  defaultAvatarKey,
  derivedKey,
  isAccountIconKey,
  isAvatarKey,
  PERSON_AVATARS,
  resolveAccountIconKey,
  resolveAvatarKey,
  suggestAccountIcon,
} from './catalog'

/** Claves del CHECK de una columna en la migración. */
function checkKeys(column: string): string[] {
  const start = galleriesSql.indexOf(`${column} in (`)
  const block = galleriesSql.slice(start, galleriesSql.indexOf(')', start))
  return [...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
}

describe('galerías', () => {
  it('20 avatares de personas y 20 iconos de Cuenta, con nombre y formato válido', () => {
    for (const [keys, labels] of [
      [AVATAR_KEYS, AVATAR_LABELS],
      [ACCOUNT_ICON_KEYS, ACCOUNT_ICON_LABELS],
    ] as const) {
      expect(keys).toHaveLength(20)
      expect(new Set(keys).size).toBe(20)
      for (const key of keys) {
        expect((labels as Record<string, string>)[key]).toBeTruthy()
        expect(key).toMatch(/^[a-z0-9-]{2,32}$/)
      }
    }
  })

  it('son iguales a los CHECK de la base', () => {
    expect(checkKeys('avatar_key').sort()).toEqual([...AVATAR_KEYS].sort())
    expect(checkKeys('icon_key').sort()).toEqual([...ACCOUNT_ICON_KEYS].sort())
  })

  it('no se mezclan: una persona no usa un icono de Cuenta ni al revés', () => {
    expect(AVATAR_KEYS.some((k) => (ACCOUNT_ICON_KEYS as readonly string[]).includes(k))).toBe(false)
    expect(isAvatarKey('pizza')).toBe(false)
    expect(isAccountIconKey('robot')).toBe(false)
  })

  it('el valor derivado es estable y se reparte', () => {
    const id = '4f0c1a52-9d1e-4a4b-9c61-3c1f0e2d7a10'
    expect(defaultAvatarKey(id)).toBe(defaultAvatarKey(id))
    expect(isAvatarKey(defaultAvatarKey(id))).toBe(true)
    expect(defaultAvatarKey(null)).toBe('chef-classic')
    expect(derivedKey(ACCOUNT_ICONS, null)).toBe('chef')
    expect(new Set(Array.from({ length: 200 }, (_, i) => derivedKey(PERSON_AVATARS, `usuario-${i}`))).size).toBeGreaterThan(10)
    expect(new Set(Array.from({ length: 200 }, (_, i) => derivedKey(ACCOUNT_ICONS, `cuenta-${i}`))).size).toBeGreaterThan(10)
  })

  it('usa la clave guardada solo si es de su galería', () => {
    expect(resolveAvatarKey('barista', 'x')).toBe('barista')
    expect(resolveAvatarKey('https://evil.test/a.png', 'x')).toBe(defaultAvatarKey('x'))
    expect(resolveAvatarKey('pizza', 'x')).toBe(defaultAvatarKey('x'))
    expect(resolveAccountIconKey('pizza', 'x')).toBe('pizza')
    expect(resolveAccountIconKey(null, 'x')).toBe(derivedKey(ACCOUNT_ICONS, 'x'))
  })

  it('sugiere un icono por el nombre de la Cuenta', () => {
    expect(suggestAccountIcon('Pizzería Norte')).toBe('pizza')
    expect(suggestAccountIcon('Hamburguesería Centro')).toBe('burger')
    expect(suggestAccountIcon('Cocina Sur')).toBe('chef')
    expect(suggestAccountIcon('Marisquería del Mar')).toBe('shrimp')
    expect(suggestAccountIcon('Mariana Postres')).toBe('donut')
  })
})
