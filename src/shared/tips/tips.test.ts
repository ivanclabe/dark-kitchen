import { describe, expect, it } from 'vitest'
import { TIPS, tipOfTheDay } from './tips'

describe('tips', () => {
  it('the short version fits one line of the loading screen (10 words at most)', () => {
    for (const t of TIPS) {
      expect(t.short.split(/\s+/).length, t.short).toBeLessThanOrEqual(10)
      expect(t.short.length, t.short).toBeLessThanOrEqual(56)
      expect(t.help).toMatch(/^\/help\/[a-z-]+\/[a-z-]+$/)
    }
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length)
  })

  it('one tip for the whole day, another one the next day', () => {
    const morning = tipOfTheDay(new Date(2026, 9, 15, 7, 0))
    expect(tipOfTheDay(new Date(2026, 9, 15, 22, 30))).toBe(morning)
    expect(tipOfTheDay(new Date(2026, 9, 16, 7, 0))).not.toBe(morning)
  })
})
