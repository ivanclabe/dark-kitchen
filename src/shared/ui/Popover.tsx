import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

type Placement = 'bottom-start' | 'bottom-end' | 'right-end'

const ITEM_SELECTOR = '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])'

const PLACEMENT_CLASS: Record<Placement, string> = {
  'bottom-start': 'md:top-full md:left-0 md:mt-2',
  'bottom-end': 'md:top-full md:right-0 md:mt-2',
  'right-end': 'md:left-full md:bottom-0 md:ml-3',
}

/**
 * Panel flotante anclado a un botón, con semántica de menú: flechas ↑/↓
 * entre los elementos `[role="menuitem"]` y `[role="menuitemradio"]`, Escape y clic afuera cierran y el
 * foco vuelve al botón. En pantallas chicas se abre como hoja inferior
 * (bottom sheet) con fondo oscurecido, que es lo cómodo en un celular.
 */
export function Popover({
  trigger,
  children,
  placement = 'bottom-start',
  label,
  className,
}: {
  trigger: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string }) => ReactNode
  /** Contenido; recibe `close` para cerrar al elegir una opción. */
  children: (close: () => void) => ReactNode
  placement?: Placement
  /** Nombre accesible del panel. */
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    // preventScroll: mover el foco nunca debe desplazar la página (el layout tiene overflow oculto y aun así se movía).
    panelRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR + ', input')?.focus({ preventScroll: true })
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    // El foco vuelve al botón que abrió el panel (lo identifica aria-controls).
    document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(panelId)}"]`)?.focus({ preventScroll: true })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(index + 1) % items.length]?.focus({ preventScroll: true })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(index - 1 + items.length) % items.length]?.focus({ preventScroll: true })
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': panelId })}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" aria-hidden onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={label}
            onKeyDown={handleKeyDown}
            className={clsx(
              'shadow-float z-50 overflow-y-auto border border-neutral-800 bg-neutral-900 p-2 text-neutral-100',
              // Celular: hoja inferior a todo lo ancho. Solo con variantes max-md para no competir con
              // la posición de escritorio (antes un "bottom auto" de escritorio anulaba el anclaje abajo
              // de right-end: el menú se abría hacia abajo, fuera de la pantalla, y desplazaba el layout).
              'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[85vh] max-md:rounded-t-2xl max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]',
              // Escritorio: flotante junto al botón, en la posición pedida.
              'md:absolute md:max-h-[min(80vh,40rem)] md:w-80 md:rounded-2xl',
              PLACEMENT_CLASS[placement],
              className,
            )}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  )
}

/** Opción de un Popover-menú: enlace o botón con ícono, accesible con teclado. */
export function PopoverItem({
  icon: Icon,
  children,
  onSelect,
  trailing,
  tone = 'default',
  checked,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>
  children: ReactNode
  onSelect: () => void
  trailing?: ReactNode
  tone?: 'default' | 'danger'
  checked?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={checked ? 'true' : undefined}
      onClick={onSelect}
      className={clsx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none',
        tone === 'danger'
          ? 'text-red-300 hover:bg-red-500/10 focus-visible:bg-red-500/10'
          : 'text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800',
      )}
    >
      {Icon && <Icon size={16} className={tone === 'danger' ? 'text-red-400' : 'text-neutral-400'} aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </button>
  )
}

export function PopoverSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-neutral-800" />
}
