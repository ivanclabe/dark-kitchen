import clsx from 'clsx'
import { cloneElement, isValidElement, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8
const EDGE = 8

type Side = 'right' | 'top' | 'top-end' | 'bottom'

/**
 * Tooltip para botones de ícono. Aparece en hover y también en focus por
 * teclado (y sobre un botón desactivado: explica por qué está gris). Si el
 * hijo es un único elemento, se le inyecta aria-describedby para que los
 * lectores de pantalla lean la etiqueta, y se le quita el title nativo para
 * que no salgan dos burbujas.
 *
 * Like InfoTip (ADR 0065), the bubble lives in a portal with fixed
 * coordinates: inside a scrolling list (the menu planner catalog, a board
 * column, a drawer) it used to be clipped by the scroll container. It flips
 * to the other side when there is no room and stays within the viewport.
 *
 * ADR 0065: Escape hides it without moving focus (WCAG 1.4.13); it comes back
 * on the next hover or focus.
 */
export function Tooltip({ label, side = 'right', children }: { label: string; side?: Side; children: ReactNode }) {
  const id = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const visible = !dismissed && (hovered || focused)

  useLayoutEffect(() => {
    // A stale position is never shown: the bubble needs `visible`, and this runs before paint.
    if (!visible) return
    function place() {
      const trigger = triggerRef.current
      const bubble = bubbleRef.current
      if (!trigger || !bubble) return
      setPos(placeBubble(trigger.getBoundingClientRect(), bubble.getBoundingClientRect(), side))
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [visible, label, side])

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string; title?: string }>, {
        'aria-describedby': (children as ReactElement<{ 'aria-describedby'?: string }>).props['aria-describedby'] ?? id,
        title: '',
      })
    : children

  return (
    <div
      ref={triggerRef}
      className="relative flex"
      // Touch has no hover: a tap would leave the bubble stuck. Focus still shows it.
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
        setDismissed(false)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setDismissed(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !dismissed) setDismissed(true)
      }}
    >
      {child}
      {createPortal(
        <span
          ref={bubbleRef}
          id={id}
          role="tooltip"
          style={pos ?? { left: 0, top: 0 }}
          className={clsx(
            'pointer-events-none fixed z-[70] w-max max-w-52 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-100 shadow-float',
            visible && pos ? 'visible' : 'invisible',
          )}
        >
          {label}
        </span>,
        document.body,
      )}
    </div>
  )
}

/** Fixed coordinates for the bubble: on the requested side, flipped when it does not fit, clamped to the viewport. */
function placeBubble(r: DOMRect, bubble: { width: number; height: number }, side: Side) {
  const { width: w, height: h } = bubble
  const vw = window.innerWidth
  const vh = window.innerHeight
  const above = r.top - GAP - h
  const below = r.bottom + GAP
  let left: number
  let top: number
  if (side === 'right') {
    left = r.right + GAP + w <= vw - EDGE ? r.right + GAP : r.left - GAP - w
    top = r.top + r.height / 2 - h / 2
  } else {
    // top-end: aligned to the trigger's right edge — for buttons at the right of a card or a column, so it opens inwards.
    left = side === 'top-end' ? r.right - w : r.left + r.width / 2 - w / 2
    if (side === 'bottom') top = below + h <= vh - EDGE ? below : above
    else top = above >= EDGE ? above : below
  }
  return {
    left: Math.round(Math.min(Math.max(left, EDGE), vw - EDGE - w)),
    top: Math.round(Math.min(Math.max(top, EDGE), vh - EDGE - h)),
  }
}
