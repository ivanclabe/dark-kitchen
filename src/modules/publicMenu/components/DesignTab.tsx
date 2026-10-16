import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { LoadingState } from '@/shared/ui/LoadingState'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { BookmarkPlus, History, LayoutGrid, LayoutTemplate, Palette, RotateCcw, Send, SlidersHorizontal, Sparkles, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useSearchParams } from 'react-router-dom'
import { uploadBrandImage } from '../api/publicMenu'
import { useDesignHistoryAction, useDesignStateAction, useMenuDesigns, usePublicMenuDraftPreview, useSaveThemeDraft, useThemeAction } from '../hooks'
import { previewMenu } from '../lib/sampleMenu'
import { designFrom, designKey, normalizeDesign, resolveTheme, TEMPLATES, withTemplate, type ResolvedTheme } from '../lib/themes'
import type { MenuDesign, PublicMenuSettings } from '../types'
import { AiDesigner } from './design/AiDesigner'
import { DesignControls } from './design/DesignControls'
import { DesignLibrary } from './design/DesignLibrary'
import { DesignPreview } from './design/DesignPreview'
import { TemplateGallery } from './design/TemplateGallery'

type View = 'ai' | 'editor' | 'library'

/**
 * Diseño (ADR 0053, 0054): three ways in — the AI designer, the visual editor
 * (template, appearance, live preview) and «Mis diseños». The draft saves
 * itself and never reaches the public page; «Publicar» does. The AI only
 * writes to «Mis diseños». After discarding, reverting or using a design, the
 * editor starts again from the server (the view stays, it is in the URL).
 */
export function DesignTab({ settings }: { settings: PublicMenuSettings }) {
  const [epoch, setEpoch] = useState(0)
  return <DesignEditor key={epoch} settings={settings} onReset={() => setEpoch((e) => e + 1)} />
}

function DesignEditor({ settings, onReset }: { settings: PublicMenuSettings; onReset: () => void }) {
  const { kitchen, feature } = useActiveKitchen()
  const aiUsable = feature('menu_designer')?.usable ?? false
  const [params, setParams] = useSearchParams()
  const requested = params.get('view')
  const view: View = requested === 'library' || (requested === 'ai' && aiUsable) ? requested : 'editor'
  const designs = useMenuDesigns()
  const history = useDesignHistoryAction()
  const applyDesign = useDesignStateAction('use')
  const publishDesign = useDesignStateAction('publish')
  const [publishing, setPublishing] = useState<MenuDesign | null>(null)
  const { show } = useToast()
  const queryClient = useQueryClient()
  const preview = usePublicMenuDraftPreview()
  const saveDraft = useSaveThemeDraft()
  const publish = useThemeAction('publish')
  const discard = useThemeAction('discard')
  const revert = useThemeAction('revert')
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(settings.themeDraft))
  const [confirm, setConfirm] = useState<'discard' | 'revert' | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const design = useMemo(() => designFrom(theme.template, theme), [theme])
  const key = designKey(design)
  // What the server holds as the draft (normalized, so equal designs compare equal).
  const savedKey = useRef(designKey(normalizeDesign(settings.themeDraft)))
  const publishedKey = designKey(normalizeDesign(settings.theme))
  const unpublished = key !== publishedKey

  async function flush(): Promise<boolean> {
    if (key === savedKey.current) return true
    setSaveState('saving')
    try {
      await saveDraft.mutateAsync(design)
      savedKey.current = key
      setSaveState('saved')
      return true
    } catch (err) {
      setSaveState('error')
      show(getErrorMessage(err, 'No se pudo guardar el borrador del diseño'), 'error')
      return false
    }
  }

  // Autosave: shortly after the last change. The public page does not change.
  useEffect(() => {
    if (key === savedKey.current) return
    const timer = setTimeout(() => void flush(), 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  async function onPublish() {
    if (!(await flush())) return
    try {
      await publish.mutateAsync()
      show('Diseño publicado: tus clientes ya ven el menú así.', 'success', { mood: 'celebrate' })
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo publicar el diseño'), 'error')
    }
  }

  function setView(next: View) {
    setParams(
      (p) => {
        const out = new URLSearchParams(p)
        if (next === 'editor') out.delete('view')
        else out.set('view', next)
        return out
      },
      { replace: true },
    )
  }

  // «Usar en el editor»: the pending edits are saved first, so nothing is lost (the server keeps a copy of an unpublished draft).
  async function onUse(target: MenuDesign) {
    if (!(await flush())) return
    try {
      const result = await applyDesign.mutateAsync(target.id)
      await queryClient.invalidateQueries({ queryKey: ['public-menu-settings'] })
      show(result.backedUp ? `«${target.name}» está en el editor. Tu borrador anterior quedó en Mis diseños.` : `«${target.name}» está en el editor. Tu página no cambió.`)
      setView('editor')
      onReset()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo usar el diseño'), 'error')
    }
  }

  async function onConfirmPublish() {
    if (!publishing || !(await flush())) return
    try {
      const result = await publishDesign.mutateAsync(publishing.id)
      await queryClient.invalidateQueries({ queryKey: ['public-menu-settings'] })
      show(result.backedUp ? `«${publishing.name}» ya está en línea. Tu borrador anterior quedó en Mis diseños.` : `«${publishing.name}» ya está en línea.`)
      setPublishing(null)
      onReset()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo publicar el diseño'), 'error')
    }
  }

  async function saveToHistory() {
    try {
      await history.save.mutateAsync({ name: `${TEMPLATES[theme.template].name} · editor`, design })
      show('Guardado en Mis diseños. Puedes renombrarlo allí.')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar el diseño'), 'error')
    }
  }

  async function onConfirm() {
    const action = confirm === 'revert' ? revert : discard
    try {
      await action.mutateAsync()
      await queryClient.invalidateQueries({ queryKey: ['public-menu-settings'] })
      show(confirm === 'revert' ? 'Volviste al diseño anterior. Ya está publicado.' : 'Cambios descartados: el editor muestra el diseño publicado.')
      setConfirm(null)
      onReset()
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo completar'), 'error')
    }
  }

  const { menu, sample } = previewMenu(preview.data, { name: settings.name, slug: settings.slug, iconKey: settings.iconKey, tagline: settings.tagline })
  const template = TEMPLATES[theme.template]
  const status =
    saveState === 'saving' ? 'Guardando borrador…' : saveState === 'error' ? 'El borrador no se guardó' : unpublished ? 'Borrador guardado · sin publicar' : 'Igual al publicado'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
        <div className="min-w-[12rem] flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-100">
            Plantilla {template.name}
            {unpublished ? (
              <Badge tone="warning" dot>
                Cambios sin publicar
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Publicado
              </Badge>
            )}
          </p>
          <p className="text-xs text-neutral-500" aria-live="polite">
            {status}
            {settings.themePublishedAt && ` · Última publicación: ${formatDateTime(settings.themePublishedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {settings.hasPreviousTheme && (
            <Button size="sm" variant="ghost" icon={History} onClick={() => setConfirm('revert')}>
              Volver al anterior
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={Undo2} disabled={!unpublished} onClick={() => setConfirm('discard')}>
            Descartar cambios
          </Button>
          <Button size="sm" variant="primary" icon={Send} disabled={!unpublished} loading={publish.isPending} onClick={() => void onPublish()}>
            Publicar diseño
          </Button>
        </div>
      </div>

      <ViewSwitch
        value={view}
        onChange={setView}
        items={[
          ...(aiUsable ? [{ value: 'ai' as const, label: 'Diseñador con IA', short: 'Con IA', icon: Sparkles }] : []),
          { value: 'editor', label: 'Editor visual', short: 'Editor', icon: SlidersHorizontal },
          { value: 'library', label: `Mis diseños${designs.data?.length ? ` (${designs.data.length})` : ''}`, short: 'Mis diseños', icon: LayoutGrid },
        ]}
      />

      {view === 'ai' ? (
        <AiDesigner menu={menu} sample={sample} designs={designs.data ?? []} onUse={(d) => void onUse(d)} onPublish={setPublishing} />
      ) : view === 'library' ? (
        designs.isLoading ? (
          <LoadingState variant="block" label="Cargando tus diseños…" />
        ) : (
          <DesignLibrary
            designs={designs.data ?? []}
            menu={menu}
            sample={sample}
            publishedKey={publishedKey}
            draftKey={key}
            onUse={(d) => void onUse(d)}
            onPublish={setPublishing}
          />
        )
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
          <div className="min-w-0 space-y-4">
            <Card title="Plantilla" icon={LayoutTemplate} description="Seis estilos distintos. Al cambiarla se conservan tu portada y tu foto de fondo.">
              {preview.isLoading ? <LoadingState variant="inline" label="Cargando…" /> : <TemplateGallery menu={menu} value={theme.template} onPick={(id) => setTheme((t) => withTemplate(id, t))} />}
            </Card>
            <Card
              title="Apariencia"
              icon={Palette}
              description="Cada cambio se ve al instante en la vista previa. Los precios, los platos y la disponibilidad salen del planificador."
            >
              <DesignControls theme={theme} set={setTheme} onUpload={(file, kind) => uploadBrandImage(kitchen.id, file, kind)} />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setTheme((t) => withTemplate(t.template, t))}>
                  Restablecer a la plantilla
                </Button>
                <Button size="sm" variant="secondary" icon={BookmarkPlus} loading={history.save.isPending} onClick={() => void saveToHistory()}>
                  Guardar en Mis diseños
                </Button>
              </div>
            </Card>
          </div>
          <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
            {preview.isLoading ? <LoadingState variant="block" label="Cargando la vista previa…" /> : <DesignPreview theme={theme} menu={menu} sample={sample} />}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={publishing !== null}
        onClose={() => setPublishing(null)}
        onConfirm={() => void onConfirmPublish()}
        pending={publishDesign.isPending}
        title={`¿Publicar «${publishing?.name ?? ''}»?`}
        description={
          <>
            Tus clientes verán este diseño desde ahora. El que está en línea queda como «anterior», por si quieres volver.
            {unpublished && ' Tus cambios sin publicar del editor se guardan en Mis diseños.'} Los platos, los precios y los pedidos no cambian.
          </>
        }
        confirmLabel="Publicar"
      />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void onConfirm()}
        pending={discard.isPending || revert.isPending}
        title={confirm === 'revert' ? '¿Volver al diseño anterior?' : '¿Descartar los cambios?'}
        description={
          confirm === 'revert'
            ? 'Se publica de nuevo el diseño que tenías antes del último cambio. El actual queda como «anterior», por si quieres regresar.'
            : 'El editor vuelve al diseño que ven hoy tus clientes. Lo que cambiaste y no publicaste se pierde.'
        }
        confirmLabel={confirm === 'revert' ? 'Volver al anterior' : 'Descartar'}
        danger={confirm === 'discard'}
      />
    </div>
  )
}

function ViewSwitch({ value, onChange, items }: { value: View; onChange: (v: View) => void; items: { value: View; label: string; short: string; icon: ComponentType<{ size?: number; className?: string }> }[] }) {
  return (
    <div role="tablist" aria-label="Cómo diseñar" className="flex w-full gap-1 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950/60 p-1 [scrollbar-width:none] sm:w-fit">
      {items.map(({ value: v, label, short, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          aria-label={label}
          onClick={() => onChange(v)}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:flex-none sm:px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none',
            value === v ? 'bg-brasa-500 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
          )}
        >
          <Icon size={15} aria-hidden />
          <span className="sm:hidden" aria-hidden>
            {short}
          </span>
          <span className="hidden sm:inline" aria-hidden>
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}
