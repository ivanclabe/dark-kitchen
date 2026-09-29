// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_ICON_KEYS, PERSON_AVATAR_KEYS } from './catalog'
import { AccountIconPicker, AvatarPicker } from './GalleryPicker'

afterEach(cleanup)

describe('galerías (ADR 0009)', () => {
  it('avatares de personas: 20 opciones, la elegida marcada, flechas para cambiar', () => {
    const onChange = vi.fn()
    render(<AvatarPicker value="barista" onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(PERSON_AVATAR_KEYS.length)
    expect(screen.getByRole('radio', { name: 'Barista' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Avatar' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith(PERSON_AVATAR_KEYS[PERSON_AVATAR_KEYS.indexOf('barista') + 1])
  })

  it('iconos de Cuenta: otra galería, sin personas', () => {
    const onChange = vi.fn()
    render(<AccountIconPicker value="pizza" onChange={onChange} compact />)
    expect(screen.getAllByRole('radio')).toHaveLength(ACCOUNT_ICON_KEYS.length)
    expect(screen.queryByRole('radio', { name: 'Barista' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Taco' }))
    expect(onChange).toHaveBeenCalledWith('taco')
    // Compacta: 5 columnas, la flecha abajo salta 5.
    fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Icono de la cuenta' }), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(ACCOUNT_ICON_KEYS[ACCOUNT_ICON_KEYS.indexOf('pizza') + 5])
  })
})
