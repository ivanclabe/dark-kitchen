// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/voice/recognition/voskModel', () => ({
  VOSK_MODEL_BYTES: 39_816_613,
  isVoskSupported: () => true,
  loadVoskModel: () => Promise.resolve(),
  useVoskModelStatus: () => ({ state: 'idle' }),
}))

const { CommandRecognitionPanel } = await import('./CommandRecognitionPanel')

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const select = () => screen.getByLabelText('Reconocimiento de voz') as HTMLSelectElement

// ADR 0071: local by default; the online recognizer only after its notice is accepted.
describe('CommandRecognitionPanel', () => {
  it('starts on the local recognizer and says the model downloads the first time', () => {
    render(<CommandRecognitionPanel />)
    expect(select().value).toBe('vosk')
    expect(screen.getByText(/se descarga la primera vez que escuches/)).toBeTruthy()
  })

  it('choosing online shows the notice and saves nothing until it is accepted', async () => {
    render(<CommandRecognitionPanel />)
    fireEvent.change(select(), { target: { value: 'browser' } })
    expect(screen.getByText(/el audio de lo que dices se envía a Google para convertirlo en texto/)).toBeTruthy()
    expect(localStorage.getItem('dk-voice-recognizer')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(select().value).toBe('vosk')
    expect(localStorage.getItem('dk-voice-online-consent')).toBeNull()

    fireEvent.change(select(), { target: { value: 'browser' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Aceptar y usar en línea' })))
    expect(select().value).toBe('browser')
    expect(localStorage.getItem('dk-voice-recognizer')).toBe('browser')
    expect(localStorage.getItem('dk-voice-online-consent')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(screen.getByText(/aceptado el/)).toBeTruthy()

    // Back to local: the acceptance is forgotten.
    await act(async () => fireEvent.change(select(), { target: { value: 'vosk' } }))
    expect(select().value).toBe('vosk')
    expect(localStorage.getItem('dk-voice-online-consent')).toBeNull()
  })

  it('a device that used online before the notice is told why it is local now', () => {
    localStorage.setItem('dk-voice-recognizer', 'browser')
    render(<CommandRecognitionPanel />)
    expect(select().value).toBe('vosk')
    expect(screen.getByText(/Este equipo usaba el reconocimiento en línea/)).toBeTruthy()
  })
})
