// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The only assistant button of the top bar: an icon, with Copilot's waiting answers on it and in its menu.
const copilot = vi.hoisted(() => ({ available: true, open: vi.fn(), unseen: 0, pending: false }))
vi.mock('@/modules/copilot/copilotContext', () => ({ useCopilot: () => copilot }))
vi.mock('../voiceContext', () => ({
  useVoice: () => ({
    available: true,
    dictating: false,
    state: 'idle',
    conversation: { active: false, end: vi.fn() },
    handsFree: { allowed: false, on: false, paused: false, state: 'idle', setOn: vi.fn(), togglePause: vi.fn() },
    listen: vi.fn(),
    lastTranscript: null,
    lastReply: null,
    liveTranscript: '',
  }),
}))
vi.mock('./VoiceDeviceSettings', () => ({ VoiceDeviceSettings: () => null }))

const { VoiceMenu } = await import('./VoiceMenu')

afterEach(() => {
  cleanup()
  copilot.unseen = 0
  copilot.available = true
})

describe('VoiceMenu', () => {
  it('is an icon with its name, and opens Copilot from its menu', () => {
    render(<VoiceMenu />)
    const button = screen.getByRole('button', { name: 'Oye quanela: háblale a quanela' })
    expect(button.textContent).toBe('')
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitem', { name: /Abrir Copilot/ }))
    expect(copilot.open).toHaveBeenCalled()
  })

  it('shows the answers waiting in Copilot', () => {
    copilot.unseen = 2
    render(<VoiceMenu />)
    const button = screen.getByRole('button', { name: 'Oye quanela: háblale a quanela. 2 respuestas sin ver en Copilot' })
    expect(button.textContent).toBe('2')
    fireEvent.click(button)
    expect(screen.getByRole('menuitem', { name: /Ver en Copilot \(2 sin ver\)/ })).toBeTruthy()
  })

  it('without Copilot, no Copilot entry', () => {
    copilot.available = false
    render(<VoiceMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Oye quanela: háblale a quanela' }))
    expect(screen.queryByRole('menuitem', { name: /Copilot/ })).toBeNull()
  })
})
