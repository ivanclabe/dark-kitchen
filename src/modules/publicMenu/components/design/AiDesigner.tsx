import { Badge } from '@/shared/ui/Badge'
import { Feedback } from '@/shared/ui/Feedback'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Chip } from '@/shared/ui/Chip'
import { Textarea } from '@/shared/ui/FormField'
import { chipClass, selectedFillClass } from '@/shared/ui/formClasses'
import clsx from 'clsx'
import { ArrowRight, PencilRuler, Send, Sparkles, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DesignerError } from '../../api/publicMenu'
import { useDesignHistoryAction } from '../../hooks'
import { resolveTheme, TEMPLATES } from '../../lib/themes'
import type { MenuDesign, PublicMenu } from '../../types'
import { DesignPreview } from './DesignPreview'
import { ThemeThumbnail } from './TemplateGallery'

const IDEAS = [
  'Una carta elegante con fondo negro y detalles dorados',
  'Un menú moderno y minimalista, con colores crema y verde oliva',
  'Fresco y colorido, para jugos y bowls',
  'Rústico y artesanal, como una panadería de barrio',
  'Carta tradicional de restaurante, sin fotos',
]

const CHANGES = ['Haz el fondo un poco más claro', 'Haz el fondo más oscuro', 'Más contraste', 'Letra más grande', 'Sin fotos', 'Botones redondeados']

const MAX_PROMPT = 500

/** v1 → v2 → … up to this design (its parents in «Mis diseños»). */
function versionsOf(id: string, byId: Map<string, MenuDesign>): MenuDesign[] {
  const chain: MenuDesign[] = []
  let current = byId.get(id)
  while (current && chain.length < 20) {
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

/**
 * Diseñador con IA (ADR 0054): the owner writes what they want, the AI proposes
 * two designs (real previews), and refines the chosen one on request. Every
 * proposal goes to «Mis diseños» only: nothing is published from here without
 * the owner's «Publicar».
 */
export function AiDesigner({
  menu,
  sample,
  designs,
  onUse,
  onPublish,
}: {
  menu: PublicMenu
  sample: boolean
  designs: MenuDesign[]
  onUse: (design: MenuDesign) => void
  onPublish: (design: MenuDesign) => void
}) {
  const { ask } = useDesignHistoryAction()
  const [prompt, setPrompt] = useState('')
  const [change, setChange] = useState('')
  const [proposalIds, setProposalIds] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // What the AI just returned (shown before the history list refetches, with its contrast notes).
  const [fresh, setFresh] = useState<Record<string, MenuDesign>>({})
  const [pending, setPending] = useState<'generate' | 'refine' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => {
    const map = new Map(designs.map((d) => [d.id, d]))
    for (const d of Object.values(fresh)) map.set(d.id, { ...map.get(d.id), ...d })
    return map
  }, [designs, fresh])
  const proposals = proposalIds.map((id) => byId.get(id)).filter((d): d is MenuDesign => !!d)
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const recent = designs.filter((d) => d.source === 'ai' && !proposalIds.includes(d.id)).slice(0, 4)
  const mini = useMemo(() => ({ ...menu, items: menu.items.slice(0, 4), business: { ...menu.business, message: null } }), [menu])

  function remember(list: MenuDesign[]) {
    setFresh((f) => ({ ...f, ...Object.fromEntries(list.map((d) => [d.id, d])) }))
  }

  async function generate(text = prompt) {
    const idea = text.trim()
    if (idea.length < 3 || pending) return
    setPrompt(idea)
    setError(null)
    setPending('generate')
    try {
      const result = await ask.mutateAsync({ action: 'generate', prompt: idea })
      remember(result)
      setProposalIds(result.map((d) => d.id))
      setSelectedId(result[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof DesignerError ? err.message : 'La IA no pudo diseñar esta vez. Intenta de nuevo o usa el editor visual.')
    } finally {
      setPending(null)
    }
  }

  async function refine(text = change) {
    const instruction = text.trim()
    if (!selected || instruction.length < 3 || pending) return
    setError(null)
    setPending('refine')
    try {
      const [next] = await ask.mutateAsync({ action: 'refine', designId: selected.id, prompt: instruction })
      if (!next) return
      remember([next])
      setProposalIds((ids) => (ids.includes(selected.id) ? ids.map((id) => (id === selected.id ? next.id : id)) : [...ids, next.id]))
      setSelectedId(next.id)
      setChange('')
    } catch (err) {
      setError(err instanceof DesignerError ? err.message : 'La IA no pudo aplicar el cambio. Intenta de nuevo.')
    } finally {
      setPending(null)
    }
  }

  const versions = selected ? versionsOf(selected.id, byId) : []

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <div className="min-w-0 space-y-4">
        <Card title="Describe tu menú" icon={Sparkles} description="La IA te propone dos diseños. Nada se publica hasta que tú lo decidas.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void generate()
            }}
          >
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
              rows={3}
              placeholder="Por ejemplo: diseña una carta elegante con fondo negro y detalles dorados"
              aria-label="Cómo quieres tu menú"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void generate()
              }}
            />
            <div className="flex flex-wrap gap-1.5" aria-label="Ideas">
              {IDEAS.map((idea) => (
                <button key={idea} type="button" onClick={() => void generate(idea)} disabled={pending !== null} className={clsx(chipClass(false), 'text-left !whitespace-normal disabled:opacity-50')}>
                  {idea}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-neutral-500 tabular-nums">
                {prompt.length}/{MAX_PROMPT}
              </span>
              <Button type="submit" variant="primary" icon={Wand2} loading={pending === 'generate'} disabled={prompt.trim().length < 3 || pending !== null}>
                Diseñar con IA
              </Button>
            </div>
          </form>
        </Card>

        {error && (
          <Feedback tone="error" description={error} />
        )}

        {(pending === 'generate' || proposals.length > 0) && (
          <section aria-label="Propuestas" className="space-y-2">
            <h3 className="text-sm font-medium text-neutral-300">{pending === 'generate' ? 'La IA está diseñando…' : 'Propuestas'}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {pending === 'generate'
                ? [0, 1].map((i) => <div key={i} className="h-80 animate-pulse rounded-xl border border-neutral-800 bg-neutral-900" aria-hidden />)
                : proposals.map((d) => <ProposalCard key={d.id} design={d} menu={mini} selected={d.id === selectedId} onSelect={() => setSelectedId(d.id)} />)}
            </div>
          </section>
        )}

        {selected && pending !== 'generate' && (
          <Card title="Pídele un cambio" icon={PencilRuler} description="La IA ajusta este diseño y guarda una versión nueva; las anteriores siguen en «Mis diseños».">
            <div className="space-y-3">
              {versions.length > 1 && (
                <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Versiones">
                  {versions.map((v, i) => (
                    <li key={v.id} className="flex items-center gap-1">
                      {i > 0 && <ArrowRight size={12} className="text-neutral-600" aria-hidden />}
                      <button
                        type="button"
                        onClick={() => setSelectedId(v.id)}
                        aria-current={v.id === selected.id}
                        title={v.prompt ?? v.name}
                        className={clsx('rounded-full px-2 py-0.5', v.id === selected.id ? selectedFillClass : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700')}
                      >
                        v{i + 1}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void refine()
                }}
              >
                <input
                  value={change}
                  onChange={(e) => setChange(e.target.value.slice(0, MAX_PROMPT))}
                  placeholder="Por ejemplo: haz el fondo un poco más claro"
                  aria-label="Qué cambiar"
                  className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-focus"
                />
                <Button type="submit" variant="secondary" icon={Send} loading={pending === 'refine'} disabled={change.trim().length < 3 || pending !== null}>
                  Cambiar
                </Button>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {CHANGES.map((c) => (
                  <Chip key={c} label={c} active={false} onClick={() => void refine(c)} />
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-800 pt-3">
                <Button variant="secondary" onClick={() => onUse(selected)} disabled={pending !== null}>
                  Usar en el editor
                </Button>
                <Button variant="primary" onClick={() => onPublish(selected)} disabled={pending !== null}>
                  Publicar este diseño
                </Button>
              </div>
            </div>
          </Card>
        )}

        {proposals.length === 0 && pending === null && recent.length > 0 && (
          <section aria-label="Tus últimas ideas" className="space-y-2">
            <h3 className="text-sm font-medium text-neutral-300">Tus últimas ideas</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map((d) => (
                <ProposalCard
                  key={d.id}
                  design={d}
                  menu={mini}
                  selected={false}
                  onSelect={() => {
                    setProposalIds([d.id])
                    setSelectedId(d.id)
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        {selected ? (
          <div className={clsx('relative transition-opacity', pending === 'refine' && 'opacity-60')}>
            <DesignPreview theme={resolveTheme(selected.design)} menu={menu} sample={sample} />
            {pending === 'refine' && (
              <p className="absolute inset-x-0 top-1/2 mx-auto w-fit rounded-full bg-neutral-900 px-4 py-2 text-sm text-neutral-100 shadow-xl" role="status">
                Aplicando el cambio…
              </p>
            )}
          </div>
        ) : (
          <div className="hidden h-[400px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-800 px-6 text-center xl:flex">
            <Sparkles size={22} className="text-neutral-600" aria-hidden />
            <p className="text-sm text-neutral-400">Aquí verás la propuesta, con tu menú de hoy, funcionando.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ProposalCard({ design, menu, selected, onSelect }: { design: MenuDesign; menu: PublicMenu; selected: boolean; onSelect: () => void }) {
  const theme = resolveTheme(design.design)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        'overflow-hidden rounded-xl border text-left transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
        selected ? 'border-brasa-500 ring-2 ring-brasa-500/40' : 'border-neutral-800 hover:border-neutral-600',
      )}
    >
      <ThemeThumbnail theme={theme} menu={menu} height={230} />
      <span className="block space-y-1 border-t border-neutral-800 bg-neutral-950 px-3 py-2.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-neutral-100">{design.name}</span>
          <span className="shrink-0 text-xs text-neutral-500">· {TEMPLATES[theme.template].name}</span>
        </span>
        {design.summary && <span className="line-clamp-2 block text-xs text-neutral-400">{design.summary}</span>}
        {design.contrastFixed && design.contrastFixed.length > 0 && (
          <Badge tone="info">Ajustamos el contraste para que se lea bien</Badge>
        )}
      </span>
    </button>
  )
}
