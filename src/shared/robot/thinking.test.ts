import { describe, expect, it } from 'vitest'
import { THINKING_STEPS, thinkingStep } from './thinking'

describe('thinkingStep', () => {
  it('moves on every 1.8 s and stays on the last phrase', () => {
    expect(thinkingStep(0)).toBe(THINKING_STEPS[0])
    expect(thinkingStep(1900)).toBe(THINKING_STEPS[1])
    expect(thinkingStep(60_000)).toBe(THINKING_STEPS[2])
  })
})
