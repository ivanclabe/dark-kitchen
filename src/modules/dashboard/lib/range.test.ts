import { describe, expect, it } from 'vitest'
import { allowedGranularities, effectiveGranularity, formatBucket, resolveRange, todayIn, utcOffsetLabel } from './range'

describe('el rango de Destacado (ADR 0072)', () => {
  const today = '2026-10-20'

  it('los últimos 7 días terminan hoy; ← va a los 7 anteriores, sin solaparse', () => {
    expect(resolveRange({ preset: '7d', offset: 0 }, today)).toEqual({ from: '2026-10-14', to: '2026-10-20' })
    expect(resolveRange({ preset: '7d', offset: -1 }, today)).toEqual({ from: '2026-10-07', to: '2026-10-13' })
  })

  it('hoy, 30 días y el mes (el actual hasta hoy; el anterior completo)', () => {
    expect(resolveRange({ preset: 'today', offset: -1 }, today)).toEqual({ from: '2026-10-19', to: '2026-10-19' })
    expect(resolveRange({ preset: '30d', offset: 0 }, today)).toEqual({ from: '2026-09-21', to: '2026-10-20' })
    expect(resolveRange({ preset: 'month', offset: 0 }, today)).toEqual({ from: '2026-10-01', to: '2026-10-20' })
    expect(resolveRange({ preset: 'month', offset: -8 }, today)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('cada hora solo hasta 7 días', () => {
    expect(allowedGranularities('2026-10-14', '2026-10-20')).toEqual(['hour', 'day'])
    expect(allowedGranularities('2026-09-21', '2026-10-20')).toEqual(['day'])
    expect(effectiveGranularity('hour', '2026-09-21', '2026-10-20')).toBe('day')
  })

  it('hoy y el desfase en la zona de la cuenta, no en la del navegador', () => {
    // 2026-10-20 03:00 UTC is still the 19th in Bogotá.
    expect(todayIn('America/Bogota', new Date('2026-10-20T03:00:00Z'))).toBe('2026-10-19')
    expect(utcOffsetLabel('America/Bogota')).toBe('UTC-5')
    expect(formatBucket('2026-10-14T13:00', 'hour')).toBe('14 oct, 13:00')
  })
})
