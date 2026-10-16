// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InfoTip } from './InfoTip'
import { Modal } from './Modal'
import { StatCard } from './StatCard'
import { Tooltip } from './Tooltip'

afterEach(cleanup)

describe('design system overlays (ADR 0065)', () => {
  it('InfoTip: the bubble lives outside the modal (not clipped) and Escape closes only the bubble', () => {
    const close = vi.fn()
    render(
      <Modal open onClose={close} title="Nuevo cliente">
        <InfoTip text="Con este número reconocemos al cliente." />
      </Modal>,
    )
    const button = screen.getByRole('button', { name: 'Más información' })
    const bubble = screen.getByRole('tooltip', { hidden: true })
    expect(screen.getByRole('dialog').contains(bubble)).toBe(false)
    expect(button.getAttribute('aria-describedby')).toBe(bubble.id)

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(close).not.toHaveBeenCalled()
  })

  it('Tooltip: Escape hides it until the pointer or focus leaves', () => {
    render(
      <Tooltip label="Archivar">
        <button>Icono</button>
      </Tooltip>,
    )
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(tip.className).toContain('group-hover:block')
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' })
    expect(tip.className).not.toContain('group-hover:block')
    fireEvent.blur(screen.getByRole('button'))
    expect(tip.className).toContain('group-hover:block')
  })

  it('StatCard: while loading there is no figure (never a fake 0) and the card is busy', () => {
    const { container } = render(<StatCard label="Por cobrar" value="$0" hint="Todo al día" loading />)
    expect(container.textContent).not.toContain('$0')
    expect(container.textContent).not.toContain('Todo al día')
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
  })
})
