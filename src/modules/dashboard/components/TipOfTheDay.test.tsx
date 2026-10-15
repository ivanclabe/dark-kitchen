// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { localDay, tipOfTheDay } from '@/shared/tips/tips'
import { TipOfTheDay } from './TipOfTheDay'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Consejo del día', () => {
  it("shows today's tip with its guide, and hides until tomorrow when closed", () => {
    render(<TipOfTheDay />)
    const tip = tipOfTheDay()
    expect(screen.getByText(tip.long)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Ver la guía/ }).getAttribute('href')).toContain(tip.help)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar el consejo hasta mañana' }))
    expect(screen.queryByText('Consejo del día')).toBeNull()
    expect(localStorage.getItem('dk-tip-dismissed')).toBe(localDay())
    cleanup()
    render(<TipOfTheDay />)
    expect(screen.queryByText('Consejo del día')).toBeNull()
  })

  it('a day closed before does not hide it today', () => {
    localStorage.setItem('dk-tip-dismissed', '2020-01-01')
    render(<TipOfTheDay />)
    expect(screen.getByText('Consejo del día')).toBeTruthy()
  })
})
