// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuPanel, type MenuNode } from './MenuPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function phone(matches: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
}

function setup(onRole = vi.fn(), onSignOut = vi.fn()) {
  const items: MenuNode[] = [
    { kind: 'section', id: 's-role', label: 'Cambiar de rol' },
    {
      kind: 'submenu',
      id: 'role',
      label: 'Administrador',
      children: [
        { kind: 'item', id: 'r-admin', label: 'Administrador', checked: true, onSelect: () => onRole('admin') },
        { kind: 'item', id: 'r-kitchen', label: 'Cocina', checked: false, onSelect: () => onRole('kitchen') },
      ],
    },
    { kind: 'separator', id: 'sep' },
    { kind: 'item', id: 'out', label: 'Cerrar sesión', tone: 'danger', onSelect: onSignOut },
  ]
  render(
    <MenuPanel
      label="Menú de usuario"
      header={<p>Ana Ruiz</p>}
      items={items}
      trigger={(props) => (
        <button type="button" {...props}>
          abrir
        </button>
      )}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'abrir' }))
  return { onRole, onSignOut }
}

describe('MenuPanel (ADR 0023)', () => {
  it('desktop: a submenu opens to the side and choosing closes everything', () => {
    phone(false)
    const { onRole } = setup()
    expect(screen.getByText('Ana Ruiz')).toBeTruthy()
    expect(screen.getByText('Cambiar de rol')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administrador' }))
    const kitchen = screen.getByRole('menuitemradio', { name: 'Cocina' })
    expect(screen.getByRole('menuitemradio', { name: 'Administrador' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(kitchen)
    expect(onRole).toHaveBeenCalledWith('kitchen')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keyboard: → opens the submenu, ← returns, Esc closes and focuses the button', () => {
    phone(false)
    setup()
    const roleItem = screen.getByRole('menuitem', { name: 'Administrador' })
    roleItem.focus()
    fireEvent.keyDown(roleItem, { key: 'ArrowRight' })
    const flyout = screen.getAllByRole('menu').find((m) => m.getAttribute('data-menu-level') === '1')!
    expect(flyout).toBeTruthy()
    fireEvent.keyDown(flyout, { key: 'ArrowLeft' })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'abrir' }))
  })

  it('↓ moves between the items of the same panel', () => {
    phone(false)
    setup()
    const menu = screen.getByRole('menu')
    screen.getByRole('menuitem', { name: 'Administrador' }).focus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))
  })

  it('a click outside closes', () => {
    phone(false)
    setup()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('phone: the submenu opens inside the same sheet, with "‹ back"', () => {
    phone(true)
    setup()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administrador' }))
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.queryByText('Ana Ruiz')).toBeNull()
    expect(screen.getByRole('menuitemradio', { name: 'Cocina' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administrador' }))
    expect(screen.getByText('Ana Ruiz')).toBeTruthy()
  })
})
