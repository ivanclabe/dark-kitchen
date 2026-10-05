// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsSaveBar } from './SettingsSaveBar'
import { SettingsSubNav } from './SettingsSubNav'

afterEach(cleanup)

// ADR 0026: one way to save and one secondary navigation in Configuración.
describe('SettingsSaveBar', () => {
  it('is hidden without changes', () => {
    const { container } = render(<SettingsSaveBar dirty={false} saving={false} onDiscard={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('with changes: «Descartar» and «Guardar cambios»; while saving, «Guardando…»', () => {
    const onDiscard = vi.fn()
    const onSave = vi.fn()
    const { rerender } = render(<SettingsSaveBar dirty saving={false} onDiscard={onDiscard} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onSave).toHaveBeenCalled()
    expect(onDiscard).toHaveBeenCalled()
    rerender(<SettingsSaveBar dirty saving onDiscard={onDiscard} onSave={onSave} />)
    expect(screen.getByRole('button', { name: /Guardando/ })).toBeTruthy()
  })

  it('after saving shows «Guardado»; an error shows inline with «Reintentar»', () => {
    const { rerender } = render(<SettingsSaveBar dirty={false} saving={false} savedAt={Date.now()} onDiscard={vi.fn()} />)
    expect(screen.getByText('Guardado')).toBeTruthy()
    rerender(<SettingsSaveBar dirty saving={false} error="Ese identificador ya lo usa otra cuenta." onDiscard={vi.fn()} onSave={vi.fn()} />)
    expect(screen.getByText('Ese identificador ya lo usa otra cuenta.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })

  it('cannot save invalid changes', () => {
    render(<SettingsSaveBar dirty saving={false} invalid onDiscard={vi.fn()} onSave={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SettingsSubNav', () => {
  it('real tabs: the selected one, and arrows move the selection', () => {
    const onChange = vi.fn()
    render(
      <SettingsSubNav
        label="Secciones de IA y voz"
        value="features"
        onChange={onChange}
        items={[
          { value: 'features', label: 'Funciones' },
          { value: 'device', label: 'Este dispositivo' },
          { value: 'usage', label: 'Uso y estado' },
        ]}
      />,
    )
    expect(screen.getByRole('tablist', { name: 'Secciones de IA y voz' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Funciones' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('device')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('usage')
  })
})
