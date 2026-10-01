// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmByName, NotAvailable } from './ui'

afterEach(cleanup)

describe('NotAvailable', () => {
  // ADR 0019: data the platform does not record is never shown as a number.
  it('says it plainly and explains why', () => {
    render(<NotAvailable reason="La voz no se registra" />)
    const el = screen.getByText('No disponible')
    expect(el.closest('[title]')?.getAttribute('title')).toBe('La voz no se registra')
  })
})

describe('ConfirmByName', () => {
  it('confirms only after typing the exact name', () => {
    const onConfirm = vi.fn()
    render(<ConfirmByName open title="Desactivar Brasa" description="Nadie podrá entrar." name="Brasa Norte" confirmLabel="Desactivar organización" onConfirm={onConfirm} onClose={() => {}} />)
    const button = screen.getByRole('button', { name: 'Desactivar organización' })
    expect(button).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'brasa norte' } })
    expect(button).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Brasa Norte' } })
    expect(button).toHaveProperty('disabled', false)
    fireEvent.click(button)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
