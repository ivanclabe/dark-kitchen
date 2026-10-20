import { Badge, type BadgeTone } from '@/shared/ui/Badge'
import { Button, IconButton } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { Drawer } from '@/shared/ui/Drawer'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FormField, Input } from '@/shared/ui/FormField'
import { Menu } from '@/shared/ui/Menu'
import { ConfirmDialog, Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import clsx from 'clsx'
import { Columns2, Eye, LayoutGrid, MoreHorizontal, PencilLine, Send, SlidersHorizontal, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDesignHistoryAction } from '../../hooks'
import { designKey, normalizeDesign, resolveTheme, TEMPLATES } from '../../lib/themes'
import type { MenuDesign, MenuDesignSource, PublicMenu } from '../../types'
import { DesignPreview } from './DesignPreview'
import { ThemeThumbnail } from './TemplateGallery'

const SOURCE: Record<MenuDesignSource, { label: string; tone: BadgeTone }> = {
  ai: { label: 'IA', tone: 'violet' },
  editor: { label: 'Editor', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'info' },
  draft_backup: { label: 'Borrador guardado', tone: 'neutral' },
}

type Filter = 'all' | 'favorites' | 'ai' | 'published'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'favorites', label: 'Favoritos' },
  { value: 'ai', label: 'Con IA' },
  { value: 'published', label: 'Publicados' },
]
const PAGE = 12

/** Equal designs compare equal however they were written. */
const keyOf = (d: MenuDesign) => designKey(normalizeDesign(d.design))

/**
 * Mis diseños (ADR 0054): every design of the business — from the AI, saved
 * from the editor, published or kept before a draft was replaced. Look, compare
 * two side by side, use one in the editor or publish it. Nothing here changes
 * the public page until «Publicar».
 */
export function DesignLibrary({
  designs,
  menu,
  sample,
  publishedKey,
  draftKey,
  onUse,
  onPublish,
}: {
  designs: MenuDesign[]
  menu: PublicMenu
  sample: boolean
  publishedKey: string
  draftKey: string
  onUse: (design: MenuDesign) => void
  onPublish: (design: MenuDesign) => void
}) {
  const { show } = useToast()
  const { update, remove } = useDesignHistoryAction()
  const [filter, setFilter] = useState<Filter>('all')
  const [visible, setVisible] = useState(PAGE)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [renaming, setRenaming] = useState<MenuDesign | null>(null)
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState<MenuDesign | null>(null)

  const mini = useMemo(() => ({ ...menu, items: menu.items.slice(0, 4), business: { ...menu.business, message: null } }), [menu])
  const shown = designs.filter((d) =>
    filter === 'favorites' ? d.favorite : filter === 'ai' ? d.source === 'ai' : filter === 'published' ? d.lastPublishedAt !== null : true,
  )
  const selected = designs.find((d) => d.id === selectedId) ?? shown[0] ?? null
  const comparison = compareIds.map((id) => designs.find((d) => d.id === id)).filter((d): d is MenuDesign => !!d)

  function toggleCompare(id: string) {
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids.slice(-1), id]))
  }

  async function run(action: () => Promise<unknown>, done: string, fail: string) {
    try {
      await action()
      show(done)
    } catch (err) {
      show(getErrorMessage(err, fail), 'error')
    }
  }

  if (designs.length === 0)
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Aún no tienes diseños guardados"
        description="Crea uno con el diseñador con IA o guárdalo desde el editor visual. Cada diseño que publiques también queda aquí."
      />
    )

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar diseños">
            {FILTERS.map((f) => (
              <Chip key={f.value} label={f.label} active={filter === f.value} onClick={() => setFilter(f.value)} />
            ))}
          </div>
          <Button size="sm" variant="secondary" icon={Columns2} disabled={comparison.length !== 2} onClick={() => setComparing(true)}>
            Comparar{comparison.length ? ` (${comparison.length}/2)` : ''}
          </Button>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">No hay diseños con este filtro.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.slice(0, visible).map((d) => {
              const key = keyOf(d)
              const live = key === publishedKey
              const inEditor = key === draftKey
              const comparingThis = compareIds.includes(d.id)
              return (
                <li
                  key={d.id}
                  className={clsx('overflow-hidden rounded-xl border bg-neutral-950', selected?.id === d.id ? 'border-neutral-50 ring-2 ring-neutral-50/30' : 'border-neutral-800')}
                >
                  <button type="button" onClick={() => setSelectedId(d.id)} className="block w-full text-left" aria-label={`Ver ${d.name}`}>
                    <ThemeThumbnail theme={resolveTheme(d.design)} menu={mini} height={170} />
                  </button>
                  <div className="space-y-1.5 border-t border-neutral-800 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-100">{d.name}</p>
                        <p className="text-xs text-neutral-500">
                          {TEMPLATES[resolveTheme(d.design).template].name} · {formatDateTime(d.createdAt)}
                        </p>
                      </div>
                      <IconButton
                        icon={Star}
                        size="sm"
                        variant="ghost"
                        active={d.favorite}
                        aria-pressed={d.favorite}
                        aria-label={d.favorite ? `Quitar ${d.name} de favoritos` : `Marcar ${d.name} como favorito`}
                        onClick={() => void run(() => update.mutateAsync({ id: d.id, favorite: !d.favorite }), d.favorite ? 'Quitado de favoritos.' : 'Marcado como favorito.', 'No se pudo guardar')}
                      />
                      <Menu
                        trigger={(props) => <IconButton {...props} icon={MoreHorizontal} size="sm" variant="ghost" aria-label={`Acciones de ${d.name}`} />}
                        items={[
                          { label: 'Ver', icon: Eye, onSelect: () => setSelectedId(d.id) },
                          { label: 'Usar en el editor', icon: SlidersHorizontal, onSelect: () => onUse(d), disabled: inEditor },
                          { label: 'Publicar', icon: Send, onSelect: () => onPublish(d), disabled: live },
                          { label: comparingThis ? 'Quitar de la comparación' : 'Comparar', icon: Columns2, onSelect: () => toggleCompare(d.id) },
                          {
                            label: 'Renombrar',
                            icon: PencilLine,
                            onSelect: () => {
                              setRenaming(d)
                              setNewName(d.name)
                            },
                            separated: true,
                          },
                          { label: 'Eliminar', icon: Trash2, onSelect: () => setDeleting(d) },
                        ]}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={SOURCE[d.source].tone}>{SOURCE[d.source].label}</Badge>
                      {live && (
                        <Badge tone="success" dot>
                          En línea
                        </Badge>
                      )}
                      {inEditor && !live && <Badge tone="warning">En el editor</Badge>}
                      {comparingThis && <Badge tone="brand">Para comparar</Badge>}
                    </div>
                    {d.prompt && <p className="line-clamp-2 text-xs text-neutral-400 italic">«{d.prompt}»</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {shown.length > visible && (
          <div className="flex justify-center">
            <Button variant="ghost" onClick={() => setVisible((v) => v + PAGE)}>
              Ver más ({shown.length - visible})
            </Button>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3 xl:sticky xl:top-4 xl:self-start">
        {selected && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-neutral-100">{selected.name}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => onUse(selected)} disabled={keyOf(selected) === draftKey}>
                  Usar en el editor
                </Button>
                <Button size="sm" variant="primary" icon={Send} onClick={() => onPublish(selected)} disabled={keyOf(selected) === publishedKey}>
                  Publicar
                </Button>
              </div>
            </div>
            <DesignPreview theme={resolveTheme(selected.design)} menu={menu} sample={sample} />
          </>
        )}
      </div>

      <Drawer open={comparing && comparison.length === 2} onClose={() => setComparing(false)} title="Comparar diseños" subtitle="Así se ven en el celular, con tu menú de hoy." size="lg">
        <div className="grid grid-cols-2 gap-3">
          {comparison.map((d) => (
            <div key={d.id} className="space-y-2">
              <div className="overflow-hidden rounded-2xl border-4 border-neutral-800">
                <ThemeThumbnail theme={resolveTheme(d.design)} menu={menu} height={560} />
              </div>
              <p className="truncate text-sm font-medium text-neutral-100">{d.name}</p>
              <Button
                size="sm"
                variant="primary"
                icon={Send}
                className="w-full"
                disabled={keyOf(d) === publishedKey}
                onClick={() => {
                  setComparing(false)
                  onPublish(d)
                }}
              >
                {keyOf(d) === publishedKey ? 'En línea' : 'Publicar este'}
              </Button>
            </div>
          ))}
        </div>
      </Drawer>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Renombrar diseño"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={update.isPending}
              disabled={newName.trim().length === 0}
              onClick={() =>
                renaming &&
                void run(() => update.mutateAsync({ id: renaming.id, name: newName.trim() }), 'Nombre guardado.', 'No se pudo renombrar').then(() => setRenaming(null))
              }
            >
              Guardar
            </Button>
          </>
        }
      >
        <FormField label="Nombre">{(a11y) => <Input {...a11y} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} autoFocus />}</FormField>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          void run(() => remove.mutateAsync(deleting.id), 'Diseño eliminado.', 'No se pudo eliminar').then(() => {
            setCompareIds((ids) => ids.filter((id) => id !== deleting.id))
            setDeleting(null)
          })
        }
        pending={remove.isPending}
        title="¿Eliminar este diseño?"
        description={
          deleting && keyOf(deleting) === publishedKey
            ? 'Es el que ven hoy tus clientes: seguirá publicado, solo sale de «Mis diseños».'
            : 'Sale de «Mis diseños». Tu página y tu borrador no cambian.'
        }
        confirmLabel="Eliminar"
        danger
      />
    </div>
  )
}
