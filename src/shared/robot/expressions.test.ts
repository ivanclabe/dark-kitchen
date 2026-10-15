import { describe, expect, it } from 'vitest'
import { MOOD_EXPRESSION, ROBOT_EXPRESSIONS, robotSrc, type RobotExpression } from './expressions'

// ADR 0060: every purpose points to a real file, in both sizes; no broken images.
const FILES = new Set(Object.keys(import.meta.glob('/public/robot/*.webp', { query: '?url', import: 'default' })).map((k) => k.replace('/public', '')))

describe('robot expressions (ADR 0060)', () => {
  it('every expression exists in public/robot in both sizes', () => {
    expect(FILES.size).toBe(Object.keys(ROBOT_EXPRESSIONS).length * 2)
    for (const expression of Object.keys(ROBOT_EXPRESSIONS) as RobotExpression[]) {
      expect(FILES.has(robotSrc(expression, 32)), robotSrc(expression, 32)).toBe(true)
      expect(FILES.has(robotSrc(expression, 112)), robotSrc(expression, 112)).toBe(true)
    }
  })

  it('each purpose has the expression of the plan', () => {
    expect(MOOD_EXPRESSION).toEqual({
      success: 'happy',
      celebrate: 'excited',
      error: 'surprised',
      warning: 'astonished',
      info: 'wink',
      help: 'idea',
      ai: 'idea',
      empty: 'wink',
      noResults: 'confused',
      idle: 'sleeping',
      thanks: 'in-love',
    })
    // The angry face is never used: next to an error it would blame the user.
    expect(Object.values(MOOD_EXPRESSION)).not.toContain('angry')
  })

  it('small file up to 48 px on screen, large above', () => {
    expect(robotSrc('happy', 48)).toBe('/robot/robot-happy-sm.webp')
    expect(robotSrc('happy', 56)).toBe('/robot/robot-happy-lg.webp')
  })
})
