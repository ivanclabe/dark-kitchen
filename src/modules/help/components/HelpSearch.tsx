import clsx from 'clsx'
import { Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { helpPath } from '@/shared/help/helpUrl'
import { HELP_SECTIONS, searchHelp } from '../lib'

/**
 * The help center's search (ADR 0034): results while typing, from the same
 * index «Oye Quanela» uses. «/» focuses it; ↑ ↓ and Enter choose.
 */
export function HelpSearch({ size = 'md', autoFocus = false, onNavigate }: { size?: 'md' | 'lg'; autoFocus?: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const hits = useMemo(() => (query.trim().length >= 2 ? searchHelp(query) : []), [query])

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (e.key !== '/' || el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '')) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function go(url: string) {
    setQuery('')
    setOpen(false)
    onNavigate?.()
    navigate(helpPath(url))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      go(hits[active].article.url)
    } else if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
    }
  }

  const showResults = open && query.trim().length >= 2

  return (
    <div className="relative w-full">
      <Search size={size === 'lg' ? 18 : 15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-500" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showResults}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Buscar en el centro de ayuda"
        placeholder={size === 'lg' ? 'Busca: «registrar un pago», «usar la cocina», «stock bajo»…' : 'Buscar en la ayuda (/)'}
        className={clsx(
          'w-full rounded-full border border-neutral-800 bg-neutral-900 pr-9 text-neutral-100 transition-colors outline-none placeholder:text-neutral-500 hover:border-neutral-700 focus:border-brasa-500 focus:ring-2 focus:ring-brasa-500/15',
          size === 'lg' ? 'h-13 pl-11 text-base' : 'h-10 pl-9 text-sm',
        )}
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          aria-label="Borrar búsqueda"
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-neutral-500 hover:text-neutral-200"
        >
          <X size={14} aria-hidden />
        </button>
      )}
      {showResults && (
        <ul id={listId} role="listbox" aria-label="Resultados" className="shadow-float absolute top-full right-0 left-0 z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-1.5">
          {hits.length === 0 ? (
            <li className="px-3 py-3 text-sm text-neutral-400">
              Sin resultados para «{query}». Prueba con otras palabras, o pregúntale a Copilot dentro de Quanela.
            </li>
          ) : (
            hits.map((hit, i) => (
              <li key={hit.article.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(hit.article.url)}
                  onMouseEnter={() => setActive(i)}
                  className={clsx('block w-full rounded-xl px-3 py-2.5 text-left', i === active ? 'bg-neutral-800' : 'hover:bg-neutral-800/60')}
                >
                  <span className="block text-sm font-medium text-neutral-100">{hit.article.title}</span>
                  <span className="block text-[11px] text-brasa-300">{HELP_SECTIONS.find((s) => s.id === hit.article.section)?.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-neutral-400">{hit.snippet}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
