// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertList } from './AlertList'

afterEach(cleanup)

describe('AlertList (ADR 0030)', () => {
  it('adds «Ver» only to the alerts that lead somewhere', () => {
    render(
      <MemoryRouter>
        <AlertList
          alerts={[
            { type: 'low_stock', severity: 'warning', message: '3 insumos bajo el mínimo' },
            { type: 'trial', severity: 'info', message: 'Prueba por vencer' },
          ]}
          linkFor={(a) => (a.type === 'low_stock' ? '/supply/stock?filter=low' : null)}
        />
      </MemoryRouter>,
    )
    const links = screen.getAllByRole('link', { name: 'Ver' })
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/supply/stock?filter=low')
  })
})
