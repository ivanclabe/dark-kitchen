/**
 * ADR 0050 — who is online in the active account. Each open tab announces
 * itself in the account's private presence channel with this; several tabs
 * (or devices) of one person are one person.
 */
export type PresenceStatus = 'active' | 'away'

/** What each tab shares: never the screen, the activity or the location. */
export interface PresenceMeta {
  userId: string
  name: string
  avatarKey: string | null
  roleName: string
  status: PresenceStatus
  /** When this tab joined (ISO). */
  onlineAt: string
}

export interface OnlinePerson {
  userId: string
  name: string
  avatarKey: string | null
  roleName: string
  status: PresenceStatus
  isMe: boolean
  /** Open tabs or devices. */
  sessions: number
}

/** A tab is away after this long hidden or without use. */
export const AWAY_AFTER_MS = 5 * 60_000

function isMeta(value: unknown): value is PresenceMeta {
  const v = value as Partial<PresenceMeta> | null
  return !!v && typeof v.userId === 'string' && typeof v.name === 'string'
}

/** The channel's presence state → one row per person: me first, then the active ones, then by name. */
export function summarizePresence(state: Record<string, unknown[]>, myUserId: string | null): OnlinePerson[] {
  const byUser = new Map<string, PresenceMeta[]>()
  for (const metas of Object.values(state)) {
    for (const meta of metas) {
      if (!isMeta(meta)) continue
      byUser.set(meta.userId, [...(byUser.get(meta.userId) ?? []), meta])
    }
  }
  const people: OnlinePerson[] = [...byUser.entries()].map(([userId, metas]) => {
    // The most recent tab says the current name and role.
    const latest = [...metas].sort((a, b) => b.onlineAt.localeCompare(a.onlineAt))[0]
    return {
      userId,
      name: latest.name,
      avatarKey: latest.avatarKey,
      roleName: latest.roleName,
      status: metas.some((m) => m.status === 'active') ? 'active' : 'away',
      isMe: userId === myUserId,
      sessions: metas.length,
    }
  })
  return people.sort(
    (a, b) => Number(b.isMe) - Number(a.isMe) || Number(b.status === 'active') - Number(a.status === 'active') || a.name.localeCompare(b.name, 'es'),
  )
}

/** «Solo tú», «3 en línea». */
export function onlineLabel(people: OnlinePerson[]): string {
  if (people.length <= 1) return 'Solo tú'
  return `${people.length} en línea`
}

/** Away when the tab was hidden or unused for AWAY_AFTER_MS. */
export function statusFor(lastActivityAt: number, now: number): PresenceStatus {
  return now - lastActivityAt >= AWAY_AFTER_MS ? 'away' : 'active'
}
