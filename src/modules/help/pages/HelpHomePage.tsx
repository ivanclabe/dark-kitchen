import { ArrowRight, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { HelpSearch } from '../components/HelpSearch'
import { helpPath } from '@/shared/help/helpUrl'
import { articlesOf, HELP_ARTICLES, HELP_SECTIONS, setCanonical } from '../lib'

/** The questions people ask most, to start from (ids of real articles). */
const POPULAR = ['create-order', 'kitchen-view', 'register-payment', 'stock', 'insights', 'oye-quanela', 'invite-team', 'first-order']

/** /help — the start of the public help center (ADR 0034). */
export function HelpHomePage() {
  useEffect(() => {
    document.title = 'Centro de ayuda de Quanela'
    setCanonical('/help')
  }, [])
  const popular = POPULAR.map((id) => HELP_ARTICLES[id]).filter(Boolean)

  return (
    <div className="max-w-5xl">
      <section className="rounded-3xl border border-neutral-800/60 bg-gradient-to-b from-brasa-500/10 to-transparent px-6 py-10 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">¿En qué te ayudamos?</h1>
        <p className="mt-2 max-w-2xl text-neutral-300">Guías cortas y paso a paso para operar tu negocio en Quanela: pedidos, cocina, inventario, clientes y reportes.</p>
        <div className="mt-6 max-w-2xl">
          <HelpSearch size="lg" />
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-sm text-neutral-400">
          <Sparkles size={14} className="text-brasa-400" aria-hidden /> Dentro de Quanela también puedes preguntar: «Oye Quanela, ¿cómo registro un pago?»
        </p>
      </section>

      {popular.length > 0 && (
        <section className="mt-10" aria-labelledby="populares">
          <h2 id="populares" className="text-lg font-semibold text-neutral-50">
            Lo más consultado
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {popular.map((a) => (
              <li key={a.id}>
                <Link to={helpPath(a.url)} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-brasa-500/40 hover:bg-neutral-900">
                  {a.title}
                  <ArrowRight size={14} className="shrink-0 text-neutral-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="secciones">
        <h2 id="secciones" className="text-lg font-semibold text-neutral-50">
          Todas las guías
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {HELP_SECTIONS.map((s) => {
            const articles = articlesOf(s)
            return (
              <div key={s.id} className="rounded-2xl border border-neutral-800 p-5">
                <Link to={helpPath(articles[0]?.url)} className="text-base font-semibold text-neutral-50 hover:text-brasa-300">
                  {s.title}
                </Link>
                <p className="mt-1 text-sm text-neutral-400">{s.description}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {articles.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      <Link to={helpPath(a.url)} className="text-neutral-300 hover:text-brasa-300">
                        {a.title}
                      </Link>
                    </li>
                  ))}
                  {articles.length > 4 && <li className="text-xs text-neutral-500">y {articles.length - 4} más</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
