import clsx from 'clsx'
import { Info } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

/**
 * ⓘ next to a field's label (ADR 0039): what the field is for and what it
 * changes — never how it is stored. Hover or focus shows it; a tap toggles it
 * (phones); Escape closes it. Read by screen readers as the button's description.
 */
export function InfoTip({ text, label = 'Más información', className }: { text: string; label?: string; className?: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  return (
    <span ref={ref} className={clsx('group/info relative ml-1 inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        className="inline-flex size-4 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-neutral-200 focus-visible:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
      >
        <Info size={13} aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className={clsx(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs leading-relaxed font-normal tracking-normal text-neutral-100 normal-case shadow-float transition-opacity duration-100',
          open ? 'opacity-100' : 'opacity-0 group-hover/info:opacity-100 group-focus-within/info:opacity-100',
        )}
      >
        {text}
      </span>
    </span>
  )
}
