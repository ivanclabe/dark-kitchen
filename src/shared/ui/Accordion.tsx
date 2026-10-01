import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

/**
 * One collapsible section: a header row (title, optional summary and
 * trailing content) that opens its body. Accessible (button with
 * aria-expanded controlling a region). Used for settings that should stay out
 * of the way until needed.
 */
export function Accordion({
  title,
  summary,
  trailing,
  defaultOpen = false,
  children,
  className,
}: {
  title: ReactNode
  /** Short line shown next to the title (e.g. the current values). */
  summary?: ReactNode
  trailing?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <div className={clsx('rounded-xl border border-neutral-800/60 bg-neutral-950/30', className)}>
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-neutral-800/30 focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none"
        >
          <ChevronDown size={14} className={clsx('shrink-0 text-neutral-500 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')} aria-hidden />
          <span className="shrink-0 text-sm font-medium text-neutral-200">{title}</span>
          {summary && <span className="min-w-0 truncate text-xs text-neutral-500">{summary}</span>}
        </button>
        {trailing}
      </div>
      {open && (
        <div id={bodyId} role="region" className="border-t border-neutral-800/60 px-3 py-3">
          {children}
        </div>
      )}
    </div>
  )
}
