// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_CHOICE_TTL_MS, clearAccountChoice, markAccountChoice, pendingAccountChoice } from './accountChoice'

// ADR 0043: «just signed in» is a mark in this tab, used once and short-lived.
describe('the mark of a fresh sign-in', () => {
  beforeEach(() => sessionStorage.clear())

  it('is pending after signing in, and gone once cleared', () => {
    expect(pendingAccountChoice()).toBe(false)
    markAccountChoice(1_000)
    expect(pendingAccountChoice(1_000 + 5_000)).toBe(true)
    clearAccountChoice()
    expect(pendingAccountChoice(1_000 + 5_000)).toBe(false)
  })

  it('expires: an abandoned sign-in never surprises later', () => {
    markAccountChoice(1_000)
    expect(pendingAccountChoice(1_000 + ACCOUNT_CHOICE_TTL_MS + 1)).toBe(false)
  })
})
