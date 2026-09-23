import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

/**
 * Tooltip puro CSS (group-hover/group-focus-within) — sin estado de React,
 * sin librería nueva. Aparece en hover y también en focus por teclado. Si el
 * hijo es un único elemento, se le inyecta aria-describedby para que los
 * lectores de pantalla lean la etiqueta.
 */
export function Tooltip({ label, side = 'right', children }: { label: string; side?: 'right' | 'top' | 'bottom'; children: ReactNode }) {
  const id = useId()
  const positionClass = {
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
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
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-100 opacity-0 shadow-float transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ${positionClass}`}
      >
        {label}
      </span>
    </div>
  )
}
