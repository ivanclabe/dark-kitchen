// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { acceptOnlineRecognition, chooseLocalRecognition, hadOnlineWithoutNotice, onlineAcceptedAt, readRecognizerPreference } from './preference'

beforeEach(() => localStorage.clear())

// ADR 0071: the local recognizer by default; the online one only after its notice.
describe('recognizer preference', () => {
  it('a new device uses the local recognizer', () => {
    expect(readRecognizerPreference()).toBe('vosk')
    expect(hadOnlineWithoutNotice()).toBe(false)
  })

  it('accepting the notice records when and switches to the online recognizer', () => {
    acceptOnlineRecognition(new Date('2026-10-19T15:00:00Z'))
    expect(readRecognizerPreference()).toBe('browser')
    expect(onlineAcceptedAt()).toBe('2026-10-19T15:00:00.000Z')
    expect(localStorage.getItem('dk-voice-online-consent')).toBe('2026-10-19T15:00:00.000Z')
  })

  it('back to local forgets the acceptance: online asks again', () => {
    acceptOnlineRecognition()
    chooseLocalRecognition()
    expect(readRecognizerPreference()).toBe('vosk')
    expect(onlineAcceptedAt()).toBeNull()
  })

  it('a device that chose online before the notice is local until it accepts', () => {
    localStorage.setItem('dk-voice-recognizer', 'browser')
    expect(readRecognizerPreference()).toBe('vosk')
    expect(hadOnlineWithoutNotice()).toBe(true)
    acceptOnlineRecognition()
    expect(readRecognizerPreference()).toBe('browser')
    expect(hadOnlineWithoutNotice()).toBe(false)
  })

  it('an explicit local choice (also under the kitchen\'s old key) is kept', () => {
    localStorage.setItem('dk-kitchen-recognizer', 'vosk')
    expect(readRecognizerPreference()).toBe('vosk')
    expect(localStorage.getItem('dk-voice-recognizer')).toBe('vosk')
  })
})
