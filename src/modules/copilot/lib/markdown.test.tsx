// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/kitchen/KitchenLink', () => ({
  KitchenLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={`/k/demo${to}`}>{children}</a>,
}))
const { CopilotMarkdown } = await import('./markdown')
const { linkTarget, parseBlocks } = await import('./markdownParse')

afterEach(cleanup)

const ID = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b'

describe('Copilot markdown', () => {
  it('maps quanela:// links to Quanela screens only', () => {
    expect(linkTarget(`quanela://order/${ID}`)).toBe(`/orders/${ID}`)
    expect(linkTarget(`quanela://ingredient/${ID}`)).toBe(`/supply/stock/${ID}`)
    expect(linkTarget('https://evil.example')).toBeNull()
    expect(linkTarget('quanela://order/not-an-id')).toBeNull()
  })

  it('parses paragraphs, lists and tables (without the separator row)', () => {
    const blocks = parseBlocks('Ventas de la semana:\n\n- Lunes: $100\n- Martes: $200\n\n| Plato | Vendidos |\n|---|---:|\n| Hamburguesa | 12 |')
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'ul', 'table'])
    expect(blocks[2]).toEqual({ kind: 'table', rows: [['Plato', 'Vendidos'], ['Hamburguesa', '12']] })
  })

  it('renders links inside the app and leaves other links as text; never raw HTML', () => {
    render(
      <MemoryRouter>
        <CopilotMarkdown text={`Mira el [pedido #1015](quanela://order/${ID}) y [esto](https://evil.example) <img src=x onerror=alert(1)> **bien**`} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'pedido #1015' }).getAttribute('href')).toBe(`/k/demo/orders/${ID}`)
    expect(screen.queryByRole('link', { name: 'esto' })).toBeNull()
    expect(screen.getByText(/<img src=x/)).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('bien').tagName).toBe('STRONG')
  })
})
