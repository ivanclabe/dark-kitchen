import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: ComponentType<{ size?: number; className?: string }>
  onSelect: () => void
  /** Marca de estado (p.ej. "Tamaño grande" activo). */
  checked?: boolean
  disabled?: boolean
  /** Dibuja un separador antes de este ítem. */
  separated?: boolean
}

/**
 * Menú desplegable con semántica ARIA de menú (role="menu"/"menuitem"),
 * flechas ↑/↓ para moverse, Escape y clic afuera para cerrar. Pensado para
 * juntar acciones secundarias detrás de un solo botón (⋯) y descargar la
 * barra de herramientas.
 */
export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  /** Recibe las props ARIA/eventos que debe llevar el botón que abre el menú. */
  trigger: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string }) => ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    // Al abrir, el foco va al primer ítem habilitado (patrón de menú ARIA).
    itemRefs.current.find((el) => el && !el.disabled)?.focus()
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const enabled = itemRefs.current.filter((el): el is HTMLButtonElement => !!el && !el.disabled)
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      enabled[(index + 1) % enabled.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      enabled[(index - 1 + enabled.length) % enabled.length]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': menuId })}
      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={handleKeyDown}
          className={clsx(
            'shadow-float absolute top-full z-40 mt-2 min-w-56 rounded-xl border border-neutral-800 bg-neutral-900 p-1',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={item.label}>
                {item.separated && <div className="my-1 h-px bg-neutral-800" role="separator" />}
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  onClick={() => {
                    close()
                    item.onSelect()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-200 outline-none hover:bg-neutral-800 focus-visible:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {Icon && <Icon size={15} className="shrink-0 text-neutral-500" />}
                  <span className="flex-1">{item.label}</span>
                  {item.checked && <span className="size-1.5 rounded-full bg-brasa-400" aria-hidden />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
