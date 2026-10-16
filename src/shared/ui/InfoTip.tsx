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
  // Horizontal nudge so the bubble stays on screen next to an edge (phones): it is centred on the ⓘ otherwise.
  const [shift, setShift] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)

  function place() {
    const button = ref.current?.querySelector('button')
    if (!button) return
    const r = button.getBoundingClientRect()
    const width = Math.min(256, window.innerWidth - 32)
    const centred = r.left + r.width / 2 - width / 2
    const fitted = Math.min(Math.max(centred, 16), window.innerWidth - 16 - width)
    setShift(Math.round(fitted - centred))
  }

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  return (
    <span ref={ref} onPointerEnter={place} onFocus={place} className={clsx('group/info relative ml-1 inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          place()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        // before: a 36 px touch area around the 16 px icon (fingers), without changing how it looks.
        className="relative inline-flex size-4 items-center justify-center rounded-full text-neutral-500 before:absolute before:-inset-2.5 before:content-[''] transition-colors hover:text-neutral-200 focus-visible:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
      >
        <Info size={13} aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
        className={clsx(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs leading-relaxed font-normal tracking-normal text-neutral-100 normal-case shadow-float transition-opacity duration-100',
          open ? 'opacity-100' : 'opacity-0 group-hover/info:opacity-100 group-focus-within/info:opacity-100',
        )}
      >
        {text}
      </span>
    </span>
  )
}
