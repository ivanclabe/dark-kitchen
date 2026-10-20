import { HELP_ARTICLES } from '@/modules/help/generated/helpContent'
import { useNotifications } from '@/modules/notifications/hooks'
import { operationNotices } from '@/modules/notifications/lib'
import { usePublicMenuSettings } from '@/modules/publicMenu/hooks'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { helpHref } from '@/shared/help/helpUrl'
import { canAccessAnyModule } from '@/shared/rbac/roles'
import clsx from 'clsx'
import { AlertTriangle, BookOpen, Info, Sparkles, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { dismiss, readDismissed } from '../lib/panels'

interface Highlight {
  id: string
  tone: 'urgent' | 'guide' | 'news'
  badge: string
  title: string
  body: string
  action: { label: string; to?: string; href?: string }
}

const TONE: Record<Highlight['tone'], { icon: LucideIcon; badge: string }> = {
  urgent: { icon: AlertTriangle, badge: 'bg-red-500/10 text-red-500 ring-red-500/20' },
  guide: { icon: BookOpen, badge: 'bg-sky-500/10 text-sky-500 ring-sky-500/20' },
  news: { icon: Info, badge: 'bg-sky-500/10 text-sky-500 ring-sky-500/20' },
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/** The latest entry of the release notes: its date and its first item (help center, ADR 0034). */
function latestNews(): Highlight | null {
  const article = HELP_ARTICLES['release-notes']
  if (!article) return null
  const date = article.html.match(/<h2[^>]*>(.*?)<\/h2>/)?.[1]
  const first = article.html.match(/<li>([\s\S]*?)<\/li>/)?.[1]
  if (!date || !first) return null
  const text = stripTags(first)
  const [title, ...rest] = text.split('. ')
  return {
    id: `news:${stripTags(date)}`,
    tone: 'news',
    badge: 'Novedades',
    title: title.replace(/\.$/, ''),
    body: rest.join('. ').slice(0, 180) || `Lo nuevo del ${stripTags(date)}.`,
    action: { label: 'Ver novedades', href: helpHref(article.url) },
  }
}

/**
 * The first row of «Destacado» (ADR 0072): the most urgent thing (from the same notices as the bell), the next
 * step for this business (a help guide), and what is new in Quanela. Each one can be dismissed on this device.
 */
export function HomeHighlights() {
  const { can, path } = useActiveKitchen()
  const notifications = useNotifications()
  const canMenu = canAccessAnyModule(can, ['publicMenu'])
  const menu = usePublicMenuSettings(canMenu)
  const [dismissed, setDismissed] = useState(readDismissed)

  const urgent = operationNotices(notifications.data?.items ?? []).find((n) => n.severity === 'error' || n.severity === 'warning')
  const items: Highlight[] = []
  if (urgent) {
    items.push({
      id: `urgent:${urgent.key}`,
      tone: 'urgent',
      badge: urgent.severity === 'error' ? 'Alta gravedad' : 'Atención',
      title: urgent.title,
      body: urgent.detail ?? 'Revísalo antes de que afecte los pedidos.',
      action: { label: urgent.action || 'Revisar', to: path(urgent.to) },
    })
  }
  const guide: Highlight =
    canMenu && menu.data && !menu.data.published
      ? {
          id: 'guide:public-menu',
          tone: 'guide',
          badge: 'Siguiente paso',
          title: 'Publica tu menú web',
          body: 'Tus clientes ven el menú de hoy en una página y sus pedidos entran directo a cocina.',
          action: { label: 'Configurar el menú', to: path('/public-menu') },
        }
      : {
          id: 'guide:help',
          tone: 'guide',
          badge: 'Documentación',
          title: 'Saca más de quanela',
          body: 'Guías cortas para pedidos, inventario, recetas, finanzas y la voz, con capturas de cada pantalla.',
          action: { label: 'Ver la ayuda', href: helpHref() },
        }
  items.push(guide)
  const news = latestNews()
  if (news) items.push(news)

  const visible = items.filter((h) => !dismissed.includes(h.id))
  if (visible.length === 0) return null

  return (
    <section aria-label="Destacado" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((h) => {
        const tone = TONE[h.tone]
        const Icon = h.tone === 'news' ? Sparkles : tone.icon
        return (
          <article key={h.id} className="flex min-w-0 flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1', tone.badge)}>
                <Icon size={13} aria-hidden /> {h.badge}
              </span>
              {h.tone !== 'urgent' && (
                <button
                  type="button"
                  onClick={() => setDismissed(dismiss(h.id))}
                  aria-label={`Descartar «${h.title}»`}
                  className="-mt-1 -mr-1 flex size-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
                >
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>
            <h3 className="mt-3 text-[15px] font-semibold text-neutral-50 first-letter:uppercase">{h.title}</h3>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-neutral-400">{h.body}</p>
            <div className="mt-4">
              {h.action.to ? (
                <Link
                  to={h.action.to}
                  className={clsx(
                    'inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition-colors',
                    h.tone === 'urgent' ? 'bg-neutral-50 text-neutral-950 hover:bg-neutral-200' : 'border border-neutral-800 text-neutral-100 hover:border-neutral-700',
                  )}
                >
                  {h.action.label}
                </Link>
              ) : (
                <a href={h.action.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-lg border border-neutral-800 px-3 text-sm font-semibold text-neutral-100 transition-colors hover:border-neutral-700">
                  {h.action.label}
                </a>
              )}
            </div>
          </article>
        )
      })}
    </section>
  )
}
