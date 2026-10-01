import { describe, expect, it } from 'vitest'
import { formatHours, formatShiftRange, groupByPersonDay, isLate, plannedHours, shiftRange, startOfWeek, workedHours } from './week'
import type { Shift } from '../types'

const shift = (over: Partial<Shift>): Shift => ({
  id: 's',
  userId: 'u',
  roleId: 'r',
  startsAt: new Date('2031-03-03T07:00:00').toISOString(),
  endsAt: new Date('2031-03-03T15:00:00').toISOString(),
  breakMinutes: 30,
  notes: null,
  status: 'scheduled',
  unplanned: false,
  clockInAt: null,
  clockOutAt: null,
  ...over,
})

describe('weeks', () => {
  it('starts on Monday at 00:00', () => {
    const sunday = new Date('2031-03-09T20:00:00')
    const monday = startOfWeek(sunday)
    expect(monday.getDay()).toBe(1)
    expect(monday.getDate()).toBe(3)
    expect(monday.getHours()).toBe(0)
  })
})

describe('shift ranges', () => {
  it('an end before the start is the next day (overnight)', () => {
    const { startsAt, endsAt } = shiftRange('2031-03-03', '22:00', '06:00')
    expect(endsAt.getDate()).toBe(4)
    expect((endsAt.getTime() - startsAt.getTime()) / 3_600_000).toBe(8)
    expect(formatShiftRange({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })).toBe('22:00–06:00 (+1)')
  })

  it('a shift ending at midnight is not marked +1', () => {
    const { startsAt, endsAt } = shiftRange('2031-03-03', '16:00', '00:00')
    expect(formatShiftRange({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })).toBe('16:00–00:00')
  })
})

describe('hours', () => {
  it('planned = length minus the break', () => {
    expect(plannedHours(shift({}))).toBe(7.5)
    expect(formatHours(7.5)).toBe('7 h 30')
    expect(formatHours(8)).toBe('8 h')
  })

  it('worked = clock in to clock out minus the break; null if never clocked in', () => {
    expect(workedHours(shift({}))).toBeNull()
    const s = shift({ clockInAt: new Date('2031-03-03T07:10:00').toISOString(), clockOutAt: new Date('2031-03-03T15:10:00').toISOString() })
    expect(workedHours(s)).toBe(7.5)
  })

  it('late after 10 minutes without clocking in', () => {
    const start = new Date('2031-03-03T07:00:00').getTime()
    expect(isLate(shift({}), start + 5 * 60_000)).toBe(false)
    expect(isLate(shift({}), start + 15 * 60_000)).toBe(true)
    expect(isLate(shift({ clockInAt: new Date(start).toISOString() }), start + 60 * 60_000)).toBe(false)
  })
})

describe('grid', () => {
  it('groups shifts by person and by the day they start (split shifts stay together)', () => {
    const week = startOfWeek(new Date('2031-03-05T12:00:00'))
    const morning = shift({ id: 'a' })
    const night = shift({ id: 'b', startsAt: new Date('2031-03-03T18:00:00').toISOString(), endsAt: new Date('2031-03-03T23:00:00').toISOString() })
    const friday = shift({ id: 'c', startsAt: new Date('2031-03-07T09:00:00').toISOString(), endsAt: new Date('2031-03-07T13:00:00').toISOString() })
    const grid = groupByPersonDay([morning, night, friday], week).get('u')!
    expect(grid[0].map((s) => s.id)).toEqual(['a', 'b'])
    expect(grid[4].map((s) => s.id)).toEqual(['c'])
  })
})
