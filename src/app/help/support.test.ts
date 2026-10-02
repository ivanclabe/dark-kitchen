import { describe, expect, it } from 'vitest'
import { browserLabel, diagnostics, diagnosticsText, reportMailto } from './support'

const input = {
  userName: 'Ana Ruiz',
  email: 'ana@correo.com',
  organization: { name: 'Dark Kitchen', code: 'FR3RK6' },
  account: { name: 'Brasa Centro', slug: 'brasa-centro' },
  role: 'Administrador',
  permissionCount: 50,
  screen: '/k/brasa-centro/orders',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  timeZone: 'America/Bogota',
  version: 'a1b2c3d',
  signedInAt: '2026-10-02T13:00:00Z',
  sessionExpiresAt: 1790950000,
  now: new Date('2026-10-02T15:00:00Z'),
}

describe('support diagnostics (ADR 0023)', () => {
  it('locates the person: organization with code, account, role, screen, device, version', () => {
    const text = diagnosticsText(diagnostics(input))
    expect(text).toContain('Organización: Dark Kitchen · FR3RK6')
    expect(text).toContain('Cuenta: Brasa Centro (brasa-centro)')
    expect(text).toContain('Rol activo: Administrador')
    expect(text).toContain('Dispositivo: Chrome 128 · macOS')
    expect(text).toContain('Versión: a1b2c3d')
  })

  it('never carries tokens or secrets', () => {
    const text = diagnosticsText(diagnostics({ ...input, screen: '/k/x/orders?token_hash=abc' }))
    expect(text).not.toMatch(/access_token|refresh_token|eyJ/)
  })

  it('the report mail has the description and the data', () => {
    const url = reportMailto('soporte@quanela.com', 'No carga Pedidos', diagnostics(input))
    expect(url.startsWith('mailto:soporte@quanela.com?subject=')).toBe(true)
    const body = decodeURIComponent(url.split('&body=')[1])
    expect(body.startsWith('No carga Pedidos')).toBe(true)
    expect(body).toContain('FR3RK6')
  })

  it('names common browsers', () => {
    expect(browserLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari 17 · iOS')
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Firefox 130 · Windows')
  })
})
