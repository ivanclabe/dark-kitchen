import type { ReactNode } from 'react'

/**
 * Tooltip puro CSS (group-hover/group-focus-within) — sin estado de React,
 * sin librería nueva. Aparece en hover y también en focus por teclado, para
 * que la navegación por teclado en el sidebar colapsado sea real.
 */
export function Tooltip({ label, side = 'right', children }: { label: string; side?: 'right' | 'top'; children: ReactNode }) {
  const positionClass =
    side === 'right'
      ? 'left-full top-1/2 ml-2 -translate-y-1/2'
      : 'bottom-full left-1/2 mb-2 -translate-x-1/2'

  return (
    <div className="group relative flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-100 opacity-0 shadow-float transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ${positionClass}`}
      >
        {label}
      </span>
    </div>
  )
}
