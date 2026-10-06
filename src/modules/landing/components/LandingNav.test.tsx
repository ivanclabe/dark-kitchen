// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingNav } from './LandingNav'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ session: null }) }))
vi.mock('@/shared/tenant/host', async (original) => ({
  ...(await original<typeof import('@/shared/tenant/host')>()),
  currentHost: () => ({ kind: 'root' }),
  docsUrl: (path = '/') => `https://doc.quanela.com${path}`,
}))

afterEach(cleanup)

describe('landing (ADR 0035)', () => {
  it('«Ayuda» opens the help center on doc.quanela.com, on the top bar and in the phone menu', () => {
    render(
      <MemoryRouter>
        <LandingNav />
      </MemoryRouter>,
    )
    const navs = screen.getAllByRole('navigation', { name: 'Secciones' })
    expect(navs).toHaveLength(2)
    for (const nav of navs) expect(within(nav).getByRole('link', { name: 'Ayuda' }).getAttribute('href')).toBe('https://doc.quanela.com/')
  })
})
