// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { Feedback } from './Feedback'
import { LoadingState } from './LoadingState'
import { ConfirmDialog } from './Modal'
import { ToastProvider, useToast } from './Toast'

afterEach(cleanup)

const robotOf = (container: HTMLElement) => container.querySelector('img[data-robot]')

describe('the robot in messages (ADR 0060)', () => {
  it('each tone shows its expression and its role; the robot is decorative', () => {
    const cases = [
      ['success', 'happy', 'status'],
      ['error', 'surprised', 'alert'],
      ['warning', 'astonished', 'alert'],
      ['ai', 'idea', 'status'],
      ['info', 'wink', null],
    ] as const
    for (const [tone, expression, role] of cases) {
      const { container, unmount } = render(<Feedback tone={tone} title="Mensaje" />)
      const img = robotOf(container)!
      expect(img.getAttribute('data-robot')).toBe(expression)
      expect(img.getAttribute('alt')).toBe('')
      expect(img.getAttribute('aria-hidden')).toBe('true')
      expect(container.firstElementChild?.getAttribute('role')).toBe(role)
      unmount()
    }
  })

  it('a celebrating success uses another face without changing its tone', () => {
    const { container } = render(<Feedback tone="success" mood="celebrate" title="Menú publicado" />)
    expect(robotOf(container)?.getAttribute('data-robot')).toBe('excited')
    expect(screen.getByRole('status').textContent).toContain('Menú publicado')
  })

  it('ErrorState keeps the real cause and the retry', () => {
    const retry = vi.fn()
    const { container } = render(<ErrorState error={new Error('Failed to fetch')} onRetry={retry} />)
    expect(screen.getByRole('alert').textContent).toContain('Failed to fetch')
    expect(robotOf(container)?.getAttribute('data-robot')).toBe('surprised')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('EmptyState: the robot on a screen state, the icon on a compact one, and the mood when asked', () => {
    const Icon = () => <svg data-testid="icon" />
    const page = render(<EmptyState icon={Icon} title="Todavía no hay recetas" action={<button>Crear receta</button>} />)
    expect(robotOf(page.container)?.getAttribute('data-robot')).toBe('wink')
    expect(screen.getByRole('button', { name: 'Crear receta' })).toBeTruthy()
    page.unmount()

    const compact = render(<EmptyState icon={Icon} title="Sin movimientos" compact />)
    expect(robotOf(compact.container)).toBeNull()
    expect(screen.getByTestId('icon')).toBeTruthy()
    compact.unmount()

    const search = render(<EmptyState icon={Icon} title="Sin resultados" compact mood="noResults" />)
    expect(robotOf(search.container)?.getAttribute('data-robot')).toBe('confused')
  })

  it('LoadingState ai: the idea robot, announced as status; reduced motion stops the bob', () => {
    const { container } = render(<LoadingState variant="ai" label="Leyendo la factura…" hint="Tarda de 10 a 40 segundos." />)
    expect(screen.getByRole('status').textContent).toContain('Leyendo la factura…')
    const img = robotOf(container)!
    expect(img.getAttribute('data-robot')).toBe('idea')
    expect(img.className).toContain('motion-safe:animate-robot-bob')
  })

  it('ConfirmDialog: the warning robot on destructive actions, and confirming still needs the button', () => {
    const confirm = vi.fn()
    render(<ConfirmDialog open onClose={() => {}} onConfirm={confirm} title="Anular pago" description="Esto no se puede deshacer." confirmLabel="Anular" danger />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('img[data-robot]')?.getAttribute('data-robot')).toBe('astonished')
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Anular' }))
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('ConfirmDialog without danger has no robot unless asked', () => {
    render(<ConfirmDialog open onClose={() => {}} onConfirm={() => {}} title="Publicar" description="Se verá en tu menú." />)
    expect(screen.getByRole('dialog').querySelector('img[data-robot]')).toBeNull()
  })

  it('toasts: one robot per tone (warning included), the message intact, a single toast per call', () => {
    function Trigger() {
      const toast = useToast()
      return (
        <>
          <button onClick={() => toast.show('Compra registrada')}>ok</button>
          <button onClick={() => toast.show('Stock bajo de Arroz', 'warning')}>warn</button>
          <button onClick={() => toast.show('No se pudo guardar: timeout', 'error')}>err</button>
          <button onClick={() => toast.show('Menú publicado', 'success', { mood: 'celebrate' })}>party</button>
        </>
      )
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    for (const name of ['ok', 'warn', 'err', 'party']) fireEvent.click(screen.getByRole('button', { name }))
    const faces = [...document.body.querySelectorAll('img[data-robot]')].map((img) => img.getAttribute('data-robot'))
    expect(faces).toEqual(['happy', 'astonished', 'surprised', 'excited'])
    expect(screen.getAllByRole('alert').map((n) => n.textContent)).toEqual(['Stock bajo de Arroz', 'No se pudo guardar: timeout'])
    expect(screen.getAllByText('Compra registrada')).toHaveLength(1)
  })
})
