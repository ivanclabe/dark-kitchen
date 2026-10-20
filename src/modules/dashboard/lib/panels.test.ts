// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { deltaOf } from './delta'
import { DEFAULT_PANELS, dismiss, movePanel, readDismissed, togglePanel, type PanelPrefs } from './panels'

afterEach(() => localStorage.clear())

describe('Destacado: comparación y paneles (ADR 0072)', () => {
  it('la variación se lee según la métrica: más ventas es bueno, más minutos en cocina no', () => {
    expect(deltaOf(120, 100, true)).toEqual({ text: '+20% vs. periodo anterior', tone: 'good' })
    expect(deltaOf(12, 10, false)).toEqual({ text: '+20% vs. periodo anterior', tone: 'bad' })
    expect(deltaOf(0.05, 0.1, false, 'points')).toEqual({ text: '-5 pts vs. periodo anterior', tone: 'good' })
  })

  it('sin cifra anterior no hay comparación inventada', () => {
    expect(deltaOf(6, 0, true)).toBeNull()
    expect(deltaOf(null, 3, true)).toBeNull()
    expect(deltaOf(0, 0, true)?.tone).toBe('neutral')
  })

  it('ocultar y reordenar paneles; descartar un aviso se recuerda', () => {
    const prefs: PanelPrefs = { order: DEFAULT_PANELS, hidden: [] }
    expect(togglePanel(prefs, 'channels').hidden).toEqual(['channels'])
    expect(movePanel(prefs, 'revenue', -1).order.slice(0, 2)).toEqual(['revenue', 'orders'])
    expect(movePanel(prefs, 'orders', -1)).toBe(prefs)
    dismiss('news:19 de octubre de 2026')
    expect(readDismissed()).toEqual(['news:19 de octubre de 2026'])
  })
})
