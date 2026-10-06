// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { CurrencyInput } from './CurrencyInput'
import { Modal } from './Modal'

afterEach(cleanup)

// The form re-creates onClose on every render, as almost every form does.
function Form() {
  const [open, setOpen] = useState(true)
  const [amount, setAmount] = useState<number | null>(null)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar pago">
        <CurrencyInput aria-label="Monto a abonar" value={amount} onValueChange={setAmount} autoFocus />
      </Modal>
    </>
  )
}

describe('Modal focus (ADR 0039 follow-up)', () => {
  it('opens on the field with autoFocus, not on the ✕', () => {
    render(<Form />)
    expect(document.activeElement).toBe(screen.getByLabelText('Monto a abonar'))
  })

  it('typing keeps the focus in the field (it used to jump to the ✕ on every key)', () => {
    render(<Form />)
    const input = screen.getByLabelText('Monto a abonar')
    for (const value of ['1', '12', '123', '1.235']) {
      act(() => input.focus())
      fireEvent.change(input, { target: { value } })
      expect(document.activeElement).toBe(input)
    }
    expect((input as HTMLInputElement).value).toBe('1.235')
  })

  it('Escape still closes it, with the latest onClose', () => {
    render(<Form />)
    fireEvent.change(screen.getByLabelText('Monto a abonar'), { target: { value: '5' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
