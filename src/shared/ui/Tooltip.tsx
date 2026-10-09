import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

/**
 * Tooltip puro CSS (group-hover/group-focus-within) — sin estado de React,
 * sin librería nueva. Aparece en hover y también en focus por teclado (y
 * sobre un botón desactivado: explica por qué está gris). Si el hijo es un
 * único elemento, se le inyecta aria-describedby para que los lectores de
 * pantalla lean la etiqueta.
 *
 * Oculto con display: none, no solo transparente: una burbuja invisible
 * junto a un botón del borde de una tarjeta igual ocupaba espacio y hacía
 * aparecer una barra de desplazamiento horizontal en las columnas.
 */
export function Tooltip({ label, side = 'right', children }: { label: string; side?: 'right' | 'top' | 'top-end' | 'bottom'; children: ReactNode }) {
  const id = useId()
  // top-end: above, aligned to the trigger's right edge — for buttons at the right of a card or a column, so it opens inwards.
  const positionClass = {
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    'top-end': 'bottom-full right-0 mb-2',
    bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  }[side]

  const child =
    isValidElement(children) && !(children as ReactElement<{ 'aria-describedby'?: string }>).props['aria-describedby']
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': id })
      : children

  return (
    <div className="group relative flex">
      {child}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute z-50 hidden w-max max-w-52 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-100 shadow-float group-hover:block group-focus-within:block ${positionClass}`}
      >
        {label}
      </span>
    </div>
  )
}
