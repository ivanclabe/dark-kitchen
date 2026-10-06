import { HELP_PATHS } from '@/shared/help/helpPaths'
import { helpHref } from '@/shared/help/helpUrl'
import { CircleHelp } from 'lucide-react'
import { Tooltip } from './Tooltip'

/**
 * «?» next to a screen's title (ADR 0034): opens its help center article (doc.quanela.com, ADR 0035) in a
 * new tab, so the work on screen stays. Nothing if the article does not exist.
 */
export function HelpButton({ article, label = 'Ayuda de esta pantalla' }: { article: string; label?: string }) {
  const path = HELP_PATHS[article]
  if (!path) return null
  const url = helpHref(path)
  return (
    <Tooltip label={label} side="bottom">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="inline-flex size-7 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500"
      >
        <CircleHelp size={16} aria-hidden />
      </a>
    </Tooltip>
  )
}
