import { describe, expect, it } from 'vitest'
import { shareMessage } from './passwordLink'

describe('shareMessage', () => {
  it('greets by first name and says what the link does', () => {
    const text = shareMessage({ name: 'Julian Gullo', email: 'j@x.co', mode: 'activation', link: 'https://quanela.com/activar/abc?token_hash=h&type=invite' })
    expect(text).toContain('Hola Julian,')
    expect(text).toContain('activar tu usuario y crear tu contraseña')
    expect(text).toContain('https://quanela.com/activar/abc?token_hash=h&type=invite')
    expect(text).toContain('un solo uso')
  })

  it('reset links only mention the password', () => {
    expect(shareMessage({ name: 'Ana', email: 'a@x.co', mode: 'reset', link: 'https://quanela.com/set-password?token_hash=h&type=recovery' })).toContain('para crear tu contraseña en Quanela')
  })
})
