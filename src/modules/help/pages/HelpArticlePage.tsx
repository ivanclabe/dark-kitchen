import clsx from 'clsx'
import { ArrowLeft, ArrowRight, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { helpPath } from '@/shared/help/helpUrl'
import { appHref, articlesOf, AUDIENCE_LABEL, formatUpdated, HELP_ARTICLES, HELP_SECTIONS, neighbours, sectionOf, setCanonical } from '../lib'
import type { HelpArticle } from '../types'

const FEEDBACK_KEY = 'dk-help-feedback'

function readFeedback(id: string): 1 | -1 | null {
  try {
    const all = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '{}') as Record<string, 1 | -1>
    return all[id] ?? null
  } catch {
    return null
  }
}

/** «¿Te sirvió?» — kept in this browser only for now (ADR 0034, Futuro: stored for the team). */
function Feedback({ id }: { id: string }) {
  const [value, setValue] = useState<1 | -1 | null>(() => readFeedback(id))
  function choose(v: 1 | -1) {
    setValue(v)
    try {
      const all = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '{}') as Record<string, 1 | -1>
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify({ ...all, [id]: v }))
    } catch {
      // Blocked storage: nothing to keep.
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
      {value ? (
        <span role="status">{value === 1 ? '¡Gracias! Nos alegra que te sirviera.' : 'Gracias por contarnos. Vamos a mejorarlo.'}</span>
      ) : (
        <>
          <span>¿Te sirvió este artículo?</span>
          <button type="button" onClick={() => choose(1)} className="inline-flex items-center gap-1 rounded-full border border-neutral-800 px-3 py-1 hover:border-neutral-700 hover:text-neutral-100">
            <ThumbsUp size={13} aria-hidden /> Sí
          </button>
          <button type="button" onClick={() => choose(-1)} className="inline-flex items-center gap-1 rounded-full border border-neutral-800 px-3 py-1 hover:border-neutral-700 hover:text-neutral-100">
            <ThumbsDown size={13} aria-hidden /> No
          </button>
        </>
      )}
    </div>
  )
}

/** Every annotated screenshot of the help center, by section (the «Capturas anotadas» page). */
function Gallery() {
  const shots = HELP_SECTIONS.flatMap((s) =>
    articlesOf(s).flatMap((a) => a.shots.filter((shot) => shot.ready || shot.notes.length > 0).map((shot) => ({ shot, article: a, section: s }))),
  )
  return (
    <div className="mt-8 space-y-10">
      {HELP_SECTIONS.map((s) => {
        const items = shots.filter((x) => x.section.id === s.id)
        if (items.length === 0) return null
        return (
          <section key={s.id} aria-labelledby={`galeria-${s.id}`}>
            <h2 id={`galeria-${s.id}`} className="text-lg font-semibold text-neutral-50">
              {s.title}
            </h2>
            <div className="mt-4 grid gap-6 xl:grid-cols-2">
              {items.map(({ shot, article }) => (
                <figure key={`${article.id}-${shot.id}`} className="help-shot !mt-0">
                  {shot.ready ? (
                    <img src={`/help/img/${shot.id}.png`} alt={shot.alt} loading="lazy" />
                  ) : (
                    <div className="help-shot-pending" role="img" aria-label={shot.alt}>
                      <span>Captura en preparación</span>
                      <small>{shot.alt}</small>
                    </div>
                  )}
                  <figcaption>
                    <Link to={helpPath(`${article.url}#captura-${shot.id}`)} className="text-sm font-medium text-brasa-300 hover:underline">
                      {article.title}
                    </Link>
                    {shot.notes.length > 0 && (
                      <ol className="help-shot-notes mt-2">
                        {shot.notes.map((n) => (
                          <li key={n}>{n.replace(/\*\*/g, '')}</li>
                        ))}
                      </ol>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ArticleView({ article }: { article: HelpArticle }) {
  const navigate = useNavigate()
  const section = sectionOf(article.section)
  const { prev, next } = neighbours(article)
  // Links between articles point to this host's addresses (doc.quanela.com has no /help prefix).
  const html = useMemo(() => article.html.replaceAll('href="/help/', `href="${helpPath('/help/')}`), [article.html])

  useEffect(() => {
    document.title = `${article.title} · Centro de ayuda de Quanela`
    document.querySelector('meta[name="description"]')?.setAttribute('content', article.summary)
    setCanonical(article.url)
  }, [article])

  // Links between articles stay inside the help center (no full reload).
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest('a[data-help-link]')
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    navigate(helpPath(link.getAttribute('href') ?? undefined))
  }

  return (
    <div className="flex gap-10">
      <article className="min-w-0 max-w-3xl flex-1">
        <nav aria-label="Ruta" className="text-xs text-neutral-500">
          <Link to={helpPath()} className="hover:text-neutral-200">
            Centro de ayuda
          </Link>
          {section && (
            <>
              {' › '}
              <span>{section.title}</span>
            </>
          )}
        </nav>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{article.title}</h1>
        <p className="mt-2 text-base text-neutral-300">{article.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {article.audience.length > 0 && (
            <span className="text-neutral-500">
              Para:{' '}
              {article.audience.map((a) => (
                <span key={a} className="ml-1 inline-block rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300">
                  {AUDIENCE_LABEL[a] ?? a}
                </span>
              ))}
            </span>
          )}
          {article.appPath && (
            <a href={appHref(article.appPath)} className="ml-auto inline-flex items-center gap-1 rounded-full border border-brasa-500/40 bg-brasa-500/10 px-3 py-1 text-brasa-300 hover:bg-brasa-500/20">
              Abrir en Quanela <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </div>

        <div className="help-prose mt-8" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
        {article.section === 'screenshots' && <Gallery />}

        {article.related.length > 0 && (
          <section className="mt-10 border-t border-neutral-800/60 pt-6" aria-labelledby="relacionados">
            <h2 id="relacionados" className="text-sm font-semibold text-neutral-100">
              Artículos relacionados
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {article.related.map((id) => HELP_ARTICLES[id]).filter(Boolean).map((r) => (
                <li key={r.id}>
                  <Link to={helpPath(r.url)} className="block rounded-xl border border-neutral-800 p-3 transition-colors hover:border-brasa-500/40 hover:bg-neutral-900">
                    <span className="block text-sm font-medium text-neutral-100">{r.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-neutral-400">{r.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 space-y-6 border-t border-neutral-800/60 pt-6">
          <Feedback id={article.id} />
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            {prev ? (
              <Link to={helpPath(prev.url)} className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-neutral-100">
                <ArrowLeft size={14} aria-hidden /> {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={helpPath(next.url)} className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-neutral-100">
                {next.title} <ArrowRight size={14} aria-hidden />
              </Link>
            )}
          </div>
          <p className="text-xs text-neutral-500">Actualizado el {formatUpdated(article.updated)}.</p>
        </div>
      </article>

      {article.headings.length > 1 && (
        <aside className="sticky top-20 hidden h-fit w-52 shrink-0 xl:block" aria-label="En esta página">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">En esta página</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {article.headings.map((h) => (
              <li key={h.id} className={clsx(h.level === 3 && 'pl-3')}>
                <a href={`#${h.id}`} className="text-neutral-400 hover:text-neutral-100">
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  )
}

/** /help/:section/:id — one article; /help/:section — its first article. */
export function HelpArticlePage() {
  const { section, id } = useParams<{ section: string; id?: string }>()
  const s = section ? sectionOf(section) : undefined
  if (!s) return <Navigate to={helpPath()} replace />
  if (!id) return <Navigate to={helpPath(HELP_ARTICLES[s.articles[0]]?.url)} replace />
  const article = HELP_ARTICLES[id]
  if (!article || article.section !== s.id) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold text-neutral-50">No encontramos ese artículo</h1>
        <p className="text-neutral-400">Puede que haya cambiado de lugar. Búscalo arriba o vuelve al inicio de la ayuda.</p>
        <Link to={helpPath()} className="text-brasa-300 hover:underline">
          Ir al centro de ayuda
        </Link>
      </div>
    )
  }
  return <ArticleView key={article.id} article={article} />
}
