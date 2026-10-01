import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Fragment, type ReactNode } from 'react'
import { linkTarget, parseBlocks } from './markdownParse'

function inline(text: string, onLink?: () => void): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i} className="font-semibold text-neutral-50">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="rounded bg-neutral-800 px-1 text-[0.9em]">{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      const to = linkTarget(link[2])
      return to ? (
        <KitchenLink key={i} to={to} onClick={onLink} className="text-brasa-300 underline decoration-brasa-500/40 underline-offset-2 hover:text-brasa-200">
          {link[1]}
        </KitchenLink>
      ) : (
        <Fragment key={i}>{link[1]}</Fragment>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

/**
 * The small Markdown that Copilot writes — paragraphs, bold, `code`, lists,
 * tables and quanela:// links — rendered as React elements (never as HTML,
 * so nothing in an answer can inject markup). See markdownParse.ts.
 */
export function CopilotMarkdown({ text, onLink }: { text: string; onLink?: () => void }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-neutral-200">
      {parseBlocks(text).map((b, i) => {
        if (b.kind === 'p') return <p key={i}>{inline(b.text, onLink)}</p>
        if (b.kind === 'h') return <p key={i} className="font-semibold text-neutral-50">{inline(b.text, onLink)}</p>
        if (b.kind === 'ul' || b.kind === 'ol') {
          const List = b.kind
          return (
            <List key={i} className={`space-y-0.5 pl-5 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-neutral-500`}>
              {b.items.map((item, j) => (
                <li key={j}>{inline(item, onLink)}</li>
              ))}
            </List>
          )
        }
        const [head, ...body] = b.rows
        return (
          <div key={i} className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-xs">
              {head && (
                <thead className="bg-neutral-900">
                  <tr>
                    {head.map((c, j) => (
                      <th key={j} className="px-2 py-1.5 text-left font-medium text-neutral-400">
                        {inline(c, onLink)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-neutral-800">
                {body.map((row, r) => (
                  <tr key={r}>
                    {row.map((c, j) => (
                      <td key={j} className="px-2 py-1.5 tabular-nums text-neutral-200">
                        {inline(c, onLink)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
