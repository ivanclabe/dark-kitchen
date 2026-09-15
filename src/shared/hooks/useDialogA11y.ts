import { useEffect, useState, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Comportamiento estándar de diálogo modal (Modal, Drawer, ConfirmDialog):
 * al abrir, mueve el foco adentro y lo atrapa con Tab/Shift+Tab; Escape
 * cierra; al cerrar, devuelve el foco a quien abrió el diálogo.
 */
export function useDialogA11y(containerRef: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const [previouslyFocused, setPreviouslyFocused] = useState<HTMLElement | null>(null)
  const [wasOpen, setWasOpen] = useState(false)

  // Captura el elemento enfocado antes de que el diálogo se abra, en el
  // propio render (no en un efecto): si se capturara en un useEffect, un
  // autoFocus dentro del contenido del diálogo ya habría movido el foco
  // para cuando ese efecto corre, y se restauraría el elemento equivocado
  // (o uno ya desmontado) al cerrar.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPreviouslyFocused(document.activeElement as HTMLElement | null)
  }

  useEffect(() => {
    if (!open) return

    const container = containerRef.current
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(focusable?.[0] ?? container)?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !container) return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      previouslyFocused?.focus?.()
    }
  }, [open, onClose, containerRef, previouslyFocused])
}
