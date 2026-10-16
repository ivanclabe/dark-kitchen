import clsx from 'clsx'
import { Info } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8
const EDGE = 16

/**
 * ⓘ next to a field's label (ADR 0039): what the field is for and what it
 * changes — never how it is stored. Hover or focus shows it; a tap toggles it
 * (phones); Escape closes it. Read by screen readers as the button's description.
 *
 * ADR 0065: the bubble lives in a portal with fixed coordinates — inside a modal
 * or a drawer (overflow: auto) it used to be clipped by the scroll container.
 * Above the ⓘ when there is room, below otherwise; always within the viewport.
 */
export function InfoTip({ text, label = 'Más información', className }: { text: string; label?: string; className?: string }) {
  const id = useId()
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const visible = !dismissed && (pinned || hovered || focused)

  useLayoutEffect(() => {
    if (!visible) return
    function place() {
      const button = ref.current?.querySelector('button')
      const bubble = bubbleRef.current
      if (!button || !bubble) return
      const r = button.getBoundingClientRect()
      const { width, height } = bubble.getBoundingClientRect()
      const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, EDGE), window.innerWidth - EDGE - width)
      const above = r.top - GAP - height
      setPos({ left: Math.round(left), top: Math.round(above >= EDGE ? above : r.bottom + GAP) })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [visible, text])

  useEffect(() => {
    if (!pinned) return
    function onPointer(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [pinned])

  return (
    <span
      ref={ref}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
        setDismissed(false)
      }}
      className={clsx('relative ml-1 inline-flex align-middle', className)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={visible}
        onClick={(e) => {
          e.preventDefault()
          setDismissed(false)
          setPinned((p) => !p)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setDismissed(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && visible) {
            // Only this bubble closes: the modal around it stays open.
            e.stopPropagation()
            setPinned(false)
            setDismissed(true)
          }
        }}
        // before: a 36 px touch area around the 16 px icon (fingers), without changing how it looks.
        className="relative inline-flex size-4 items-center justify-center rounded-full text-neutral-500 before:absolute before:-inset-2.5 before:content-[''] transition-colors hover:text-neutral-200 focus-visible:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Info size={13} aria-hidden />
      </button>
      {createPortal(
        <span
          ref={bubbleRef}
          id={id}
          role="tooltip"
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0 }}
          className={clsx(
            'pointer-events-none fixed z-[70] w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs leading-relaxed font-normal tracking-normal text-neutral-100 normal-case shadow-float transition-opacity duration-100',
            visible && pos ? 'opacity-100' : 'invisible opacity-0',
          )}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}
