import { helpHref } from '@/shared/help/helpUrl'
import { localDay, tipOfTheDay } from '@/shared/tips/tips'
import { Feedback } from '@/shared/ui/Feedback'
import { ArrowUpRight, X } from 'lucide-react'
import { useState } from 'react'

const DISMISSED_KEY = 'dk-tip-dismissed'

function dismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === localDay()
  } catch {
    return false
  }
}

/**
 * «Consejo del día» on Inicio: one thing Quanela does, with its guide; a different one each day. Hidden until
 * tomorrow on this device when closed (the loading screens only show the short version, when there is time).
 */
export function TipOfTheDay() {
  const [hidden, setHidden] = useState(dismissedToday)
  if (hidden) return null
  const tip = tipOfTheDay()

  function hide() {
    try {
      localStorage.setItem(DISMISSED_KEY, localDay())
    } catch {
      // Storage blocked: it hides until the page reloads.
    }
    setHidden(true)
  }

  return (
    <div className="relative">
      <Feedback
        tone="help"
        role={null}
        title="Consejo del día"
        description={tip.long}
        className="pr-11"
        action={
          <a href={helpHref(tip.help)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brasa-400 hover:text-brasa-300 hover:underline">
            Ver la guía <ArrowUpRight size={14} aria-hidden />
          </a>
        }
      />
      <button
        type="button"
        onClick={hide}
        aria-label="Ocultar el consejo hasta mañana"
        title="Ocultar hasta mañana"
        className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
