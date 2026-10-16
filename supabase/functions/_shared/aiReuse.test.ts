import { describe, expect, it } from 'vitest'
import { decideBeforeInput, sameInputAsLast, withinFrequency, type InsightRow } from './aiReuse'

const T0 = Date.parse('2031-03-03T11:00:00Z')
const MIN = 60_000
const row = (status: string, minutesAgo: number, hash: string | null = null, now = T0): InsightRow => ({
  status,
  created_at: new Date(now - minutesAgo * MIN).toISOString(),
  input_hash: hash,
})

describe('the reuse rule (ADR 0063 D1)', () => {
  it('reuses the last good analysis within the frequency', () => {
    expect(decideBeforeInput([row('ok', 5)], 10, T0)).toMatchObject({ kind: 'reuse' })
    expect(decideBeforeInput([row('ok', 15)], 10, T0)).toEqual({ kind: 'compute' })
  })

  it('waits after an error within the frequency, unless forced', () => {
    expect(decideBeforeInput([row('error', 3), row('ok', 30)], 10, T0)).toEqual({ kind: 'error_backoff' })
    expect(decideBeforeInput([row('error', 3), row('ok', 30)], 10, T0, true)).toEqual({ kind: 'compute' })
  })

  it('reuses the same input within a day, never a different one or a forced one', () => {
    expect(sameInputAsLast([row('ok', 120, 'h1')], 'h1', T0, 10)).not.toBeNull()
    expect(sameInputAsLast([row('ok', 120, 'h1')], 'h2', T0, 10)).toBeNull()
    expect(sameInputAsLast([row('ok', 25 * 60, 'h1')], 'h1', T0, 10)).toBeNull()
    expect(sameInputAsLast([row('ok', 120, 'h1')], 'h1', T0, 10, true)).toBeNull()
    // A daily feature keeps the same answer for three days.
    expect(sameInputAsLast([row('ok', 2 * 24 * 60, 'h1')], 'h1', T0, 1440)).not.toBeNull()
    expect(sameInputAsLast([row('ok', 3 * 24 * 60, 'h1')], 'h1', T0, 1440)).toBeNull()
  })

  it('a frequency of 0 never counts as fresh', () => {
    expect(withinFrequency(row('ok', 1), 0, T0)).toBe(false)
  })
})

/**
 * A day of service with the kitchen screen open (Cocina en vivo polls every
 * `frequency_min`). `stateAt(minute)` is the version of what the model would
 * see (orders, states, flags — not the minutes, ADR 0063): the fingerprint
 * changes only when it changes. Returns the model calls with the old rule
 * (frequency only) and the new one (frequency + fingerprint).
 */
function simulate(opts: { minutes: number; frequencyMin: number; stateAt: (minute: number) => number | null }) {
  let before = 0
  let after = 0
  let rowsBefore: InsightRow[] = []
  let rowsAfter: InsightRow[] = []
  for (let m = 0; m < opts.minutes; m += opts.frequencyMin) {
    const now = T0 + m * MIN
    const state = opts.stateAt(m)
    const hash = state === null ? null : `v${state}`
    // Old rule: within the frequency reuse, otherwise call (no orders → «empty», no call).
    if (decideBeforeInput(rowsBefore, opts.frequencyMin, now).kind === 'compute') {
      if (hash === null) rowsBefore = [{ status: 'empty', created_at: new Date(now).toISOString() }, ...rowsBefore]
      else {
        before++
        rowsBefore = [{ status: 'ok', created_at: new Date(now).toISOString() }, ...rowsBefore]
      }
    }
    // New rule: the same, plus «same input as the last good analysis → reuse».
    if (decideBeforeInput(rowsAfter, opts.frequencyMin, now).kind === 'compute') {
      if (hash === null) rowsAfter = [{ status: 'empty', created_at: new Date(now).toISOString(), input_hash: 'empty' }, ...rowsAfter]
      else if (!sameInputAsLast(rowsAfter, hash, now, opts.frequencyMin)) {
        after++
        rowsAfter = [{ status: 'ok', created_at: new Date(now).toISOString(), input_hash: hash }, ...rowsAfter]
      }
    }
  }
  return { before, after }
}

describe('model calls in a day (ADR 0063 D7: before and after)', () => {
  it('Cocina en vivo, 11:00–23:00 every 10 min: lunch and dinner change, the afternoon is quiet', () => {
    // 12:00–14:30 and 18:30–21:30 the orders change every poll; 14:30–18:30 two orders sit still;
    // 11:00–12:00 and after 21:30 there are no orders (never a call, before or after).
    const stateAt = (m: number) => {
      if (m < 60 || m >= 630) return null
      if (m >= 210 && m < 450) return 1000
      return m
    }
    const { before, after } = simulate({ minutes: 12 * 60, frequencyMin: 10, stateAt })
    expect(before).toBe(57)
    expect(after).toBe(34)
  })

  it('Reponer, every 6 h on two screens opened all day: stock changes twice', () => {
    // Opened every 30 min; the stock changes at 14:00 (a purchase) and 20:00 (end of service).
    const stateAt = (m: number) => (m < 180 ? 1 : m < 540 ? 2 : 3)
    const { before, after } = simulate({ minutes: 12 * 60, frequencyMin: 360, stateAt })
    expect(before).toBe(2)
    expect(after).toBe(2)
  })

  it('Poco movimiento, daily, 7 days with the same stock for 5 of them', () => {
    const day = 24 * 60
    const stateAt = (m: number) => (m < 2 * day ? 1 : 2)
    const { before, after } = simulate({ minutes: 7 * day, frequencyMin: 24 * 60, stateAt })
    // Calls on day 1, day 3 (the stock changed) and day 6 (three days with the same input: refreshed once).
    expect(before).toBe(7)
    expect(after).toBe(3)
  })
})
