import { describe, expect, it } from 'vitest'
import { frequencyLabel, openComplaints, preferencesOf } from './profile'
import type { CustomerComplaint, CustomerPreference } from '../types'

describe('customer 360° (ADR 0040)', () => {
  it('says how often the customer orders, only from real averages', () => {
    expect(frequencyLabel(null)).toBeNull()
    expect(frequencyLabel(1)).toBe('A diario')
    expect(frequencyLabel(7)).toBe('Cada semana')
    expect(frequencyLabel(14.5)).toBe('Cada dos semanas')
    expect(frequencyLabel(30)).toBe('Cada mes')
    expect(frequencyLabel(10.4)).toBe('Cada 10 días')
  })

  it('groups preferences and finds the open complaints', () => {
    const prefs = [{ kind: 'dietary' }, { kind: 'favorite_dish' }, { kind: 'dietary' }] as CustomerPreference[]
    expect(preferencesOf(prefs, 'dietary')).toHaveLength(2)
    const complaints = [{ status: 'pending' }, { status: 'resolved' }, { status: 'in_review' }] as CustomerComplaint[]
    expect(openComplaints(complaints)).toHaveLength(2)
  })
})
