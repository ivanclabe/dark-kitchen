import { describe, expect, it } from 'vitest'
import { DEFAULT_VOICE_SETTINGS, toVoiceSettings, type VoiceProfile } from './catalog'
import { kitchenPhrases, stallAnnouncement } from './kitchenPhrases'
import { effectiveVoice, resolveDeviceVoice, type DeviceVoice } from './resolveVoice'

describe('kitchen phrases (ADR 0014, 9.4): short, clear, no extra words', () => {
  it('commands', () => {
    expect(kitchenPhrases.commandDone('1042', 'MARK_READY', 'standard')).toBe('Pedido 1042 listo.')
    expect(kitchenPhrases.commandDone('1042', 'CANCEL', 'standard')).toBe('Pedido 1042 cancelado.')
    expect(kitchenPhrases.commandDone('1042', 'MARK_READY', 'minimal')).toBe('1042 listo.')
    expect(kitchenPhrases.notUnderstood('standard')).toBe('No entendí.')
    expect(kitchenPhrases.orderNotFound('77', 'standard')).toBe('Pedido 77 no existe.')
    expect(kitchenPhrases.alreadyInState('1042', 'listo', 'standard')).toBe('Pedido 1042 ya está listo.')
    expect(kitchenPhrases.insight('Prioriza el 1042', 'minimal')).toBe('Sugerencia en pantalla.')
  })

  it('stall alerts count orders, not dishes', () => {
    const dish = (order: string, product: string, minutes: number) => ({ orderNumber: order, product, minutes, statusPhrase: 'sin empezar' })
    expect(stallAnnouncement([dish('1042', 'Papas', 12), dish('1042', 'Hamburguesa doble', 14)], 'standard')).toBe('Pedido 1042: Hamburguesa doble, 14 minutos sin empezar.')
    expect(stallAnnouncement([], 'standard')).toBeNull()
  })
})

const voice = (name: string, lang: string, isDefault = false): DeviceVoice => ({ name, lang, voiceURI: `uri:${name}`, default: isDefault })
const VOICES = [voice('Google español', 'es-ES', true), voice('Paulina', 'es-MX'), voice('Jorge (Enhanced)', 'es-MX'), voice('Samantha', 'en-US')]
const profile = (over: Partial<VoiceProfile>): VoiceProfile => ({
  key: 'sofia',
  name: 'Sofía',
  gender: 'female',
  defaultStyle: 'friendly',
  pitch: 1.1,
  lang: 'es-CO',
  provider: 'device',
  deviceVoiceHints: ['Paulina'],
  description: '',
  active: true,
  sortOrder: 10,
  ...over,
})

describe('device voice resolution', () => {
  it('uses the first installed voice matching the hints, accent-insensitive', () => {
    expect(resolveDeviceVoice(VOICES, profile({ deviceVoiceHints: ['Mónica', 'jorge'] }), 'es-MX')).toEqual({ voice: VOICES[2], source: 'profile' })
  })

  it('falls back to any Spanish voice when the locale is not installed, then the default', () => {
    const r = resolveDeviceVoice(VOICES, profile({ deviceVoiceHints: ['Nadie'] }), 'es-CO')
    expect(r.source).toBe('fallback')
    expect(r.voice?.lang.startsWith('es')).toBe(true)
  })

  it('a voice pinned on the device wins while it is installed', () => {
    expect(resolveDeviceVoice(VOICES, profile({}), 'es-MX', 'uri:Jorge (Enhanced)').source).toBe('pinned')
    expect(resolveDeviceVoice(VOICES, profile({}), 'es-MX', 'uri:ya-no-existe').source).toBe('profile')
  })

  it('effective voice applies style to speed/pitch and phrase length', () => {
    const v = effectiveVoice({ ...DEFAULT_VOICE_SETTINGS, profile: 'sofia', style: 'minimal', rate: 1.2, lang: 'es-MX' }, [profile({})], VOICES)
    expect(v.params.rate).toBeCloseTo(1.38)
    expect(v.params.pitch).toBeCloseTo(1.1)
    expect(v.verbosity).toBe('minimal')
    expect(v.params.voice?.name).toBe('Paulina')
  })

  it('an unknown or hidden profile falls back to an active one', () => {
    const v = effectiveVoice({ ...DEFAULT_VOICE_SETTINGS, profile: 'hidden' }, [profile({ key: 'hidden', active: false }), profile({ key: 'laura', name: 'Laura' })], VOICES)
    expect(v.profile?.key).toBe('laura')
  })

  it('settings from the database are normalized', () => {
    expect(toVoiceSettings({ profile: 'daniel', style: 'loud', rate: 9, lang: 'fr-FR' })).toEqual({ profile: 'daniel', style: 'natural', rate: 1.5, volume: 1, lang: 'es-CO' })
  })
})
