import { describe, expect, it } from 'vitest'
import { AWAY_AFTER_MS, onlineLabel, statusFor, summarizePresence, type PresenceMeta } from './presence'

// ADR 0050: people, not tabs; me first, then the active ones.
const meta = (over: Partial<PresenceMeta>): PresenceMeta => ({
  userId: 'u1', name: 'Laura Gómez', avatarKey: null, roleName: 'Administrador', status: 'active', onlineAt: '2026-10-10T10:00:00Z', ...over,
})

describe('summarizePresence', () => {
  it('several tabs or devices of one person are one person (active if any tab is)', () => {
    const people = summarizePresence(
      {
        u1: [meta({ status: 'away' }), meta({ status: 'active', onlineAt: '2026-10-10T10:05:00Z' })],
        u2: [meta({ userId: 'u2', name: 'Andrés', roleName: 'Cocina', status: 'away' })],
      },
      'u1',
    )
    expect(people).toHaveLength(2)
    expect(people[0]).toMatchObject({ userId: 'u1', isMe: true, status: 'active', sessions: 2 })
    expect(people[1]).toMatchObject({ userId: 'u2', status: 'away', roleName: 'Cocina' })
  })

  it('me first, then the active ones, then by name; the latest tab says the role', () => {
    const people = summarizePresence(
      {
        a: [meta({ userId: 'b', name: 'Beatriz', status: 'away' })],
        b: [meta({ userId: 'z', name: 'Zoe' })],
        c: [meta({ userId: 'a', name: 'Álvaro' })],
        me: [meta({ userId: 'me', name: 'Yo', roleName: 'Cocina' }), meta({ userId: 'me', name: 'Yo', roleName: 'Caja', onlineAt: '2026-10-10T11:00:00Z' })],
      },
      'me',
    )
    expect(people.map((p) => p.name)).toEqual(['Yo', 'Álvaro', 'Zoe', 'Beatriz'])
    expect(people[0].roleName).toBe('Caja')
  })

  it('ignores what is not a presence of the app', () => {
    expect(summarizePresence({ x: [{ presence_ref: '1' }, null] }, 'u1')).toEqual([])
  })
})

describe('labels and status', () => {
  it('«Solo tú» or «N en línea»', () => {
    expect(onlineLabel([])).toBe('Solo tú')
    expect(onlineLabel(summarizePresence({ u1: [meta({})] }, 'u1'))).toBe('Solo tú')
    expect(onlineLabel(summarizePresence({ u1: [meta({})], u2: [meta({ userId: 'u2' })], u3: [meta({ userId: 'u3' })] }, 'u1'))).toBe('3 en línea')
  })

  it('away after 5 minutes without use', () => {
    expect(statusFor(0, AWAY_AFTER_MS - 1)).toBe('active')
    expect(statusFor(0, AWAY_AFTER_MS)).toBe('away')
  })
})
