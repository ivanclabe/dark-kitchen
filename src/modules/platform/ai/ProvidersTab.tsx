import { useAiConnectionStatus } from '@/modules/ai/hooks/useAi'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { Drawer } from '@/shared/ui/Drawer'
import { Input } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { formatUsd, PLATFORM_AI_KEY, setPlatformModel, type PlatformModel } from './api'

type ModelDraft = { key: string; label: string; input: string; output: string; active: boolean; isNew: boolean }

const toDraft = (m: PlatformModel | null): ModelDraft =>
  m
    ? { key: m.key, label: m.label, input: m.inputPricePerMTok?.toString() ?? '', output: m.outputPricePerMTok?.toString() ?? '', active: m.active, isNew: false }
    : { key: '', label: '', input: '', output: '', active: true, isNew: true }

function ModelDrawer({ model, onClose }: { model: PlatformModel | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [draft, setDraft] = useState<ModelDraft>(() => toDraft(model))
  const price = (v: string) => (v.trim() === '' ? null : Number(v))
  const invalid = !draft.key.trim() || !draft.label.trim() || [draft.input, draft.output].some((v) => v.trim() !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0))

  const save = useMutation({
    mutationFn: () => setPlatformModel({ key: draft.key.trim(), label: draft.label.trim(), inputPricePerMTok: price(draft.input), outputPricePerMTok: price(draft.output), active: draft.active }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLATFORM_AI_KEY })
      show('Modelo guardado.')
      onClose()
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar el modelo'), 'error'),
  })

  return (
    <Drawer open onClose={onClose} title={model ? model.label : 'Nuevo modelo'} subtitle="Catálogo de modelos de IA permitidos">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!invalid) save.mutate()
        }}
      >
        <div>
          <label htmlFor="model-key" className="text-xs text-neutral-400">
            Identificador del proveedor
          </label>
          <Input id="model-key" value={draft.key} disabled={!draft.isNew} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="claude-…" className="!mt-1" />
        </div>
        <div>
          <label htmlFor="model-label" className="text-xs text-neutral-400">
            Nombre
          </label>
          <Input id="model-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="!mt-1" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="model-in" className="text-xs text-neutral-400">
              Precio entrada (USD / millón de tokens)
            </label>
            <Input id="model-in" type="number" step="0.0001" min={0} value={draft.input} onChange={(e) => setDraft({ ...draft, input: e.target.value })} className="!mt-1" />
          </div>
          <div>
            <label htmlFor="model-out" className="text-xs text-neutral-400">
              Precio salida (USD / millón de tokens)
            </label>
            <Input id="model-out" type="number" step="0.0001" min={0} value={draft.output} onChange={(e) => setDraft({ ...draft, output: e.target.value })} className="!mt-1" />
          </div>
        </div>
        <p className={typography.caption}>Copia los precios vigentes del proveedor. Solo sirven para estimar costos; vacíos = sin estimación.</p>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
          Activo (se puede asignar a funciones)
          <Switch checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} label="Modelo activo" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={invalid}>
            Guardar
          </Button>
        </div>
      </form>
    </Drawer>
  )
}

/**
 * AI providers (ADR 0014, 6). The API key lives only as an Edge Function
 * secret: this screen shows whether it is set, never the key.
 */
export function ProvidersTab({ models, labelOf }: { models: PlatformModel[]; labelOf: (key: string) => string }) {
  const connection = useAiConnectionStatus()
  const [editing, setEditing] = useState<PlatformModel | 'new' | null>(null)
  const configured = connection.data?.configured === true

  const columns: DataTableColumn<PlatformModel>[] = [
    {
      key: 'label',
      header: 'Modelo',
      cell: (m) => (
        <span className="min-w-0">
          <span className="block font-medium text-neutral-100">{m.label}</span>
          <span className="block truncate text-xs text-neutral-500">{m.key}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Estado', hideBelow: 'md', cell: (m) => <Badge tone={m.active ? 'success' : 'neutral'} size="sm" dot>{m.active ? 'Activo' : 'Inactivo'}</Badge> },
    {
      key: 'price',
      header: 'Precio (entrada / salida)',
      hideBelow: 'md',
      cell: (m) => (
        <span className="text-xs text-neutral-300 tabular-nums">
          {m.inputPricePerMTok === null || m.outputPricePerMTok === null ? 'Sin precio' : `${formatUsd(m.inputPricePerMTok)} / ${formatUsd(m.outputPricePerMTok)}`}
        </span>
      ),
    },
    { key: 'used', header: 'Lo usan', cell: (m) => <span className="text-xs text-neutral-400">{m.usedBy.length === 0 ? '—' : m.usedBy.map(labelOf).join(', ')}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      cell: (m) => (
        <Button variant="link" size="sm" onClick={() => setEditing(m)}>
          Editar
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className={clsx('flex items-start gap-3 rounded-2xl border p-4', configured ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
        {configured ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> : <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-400" />}
        <div className="min-w-0 text-sm">
          <p className="font-medium text-neutral-100">Anthropic {connection.isLoading ? '· verificando…' : configured ? '· clave configurada' : '· sin clave'}</p>
          <p className={typography.caption}>
            La clave vive solo como secreto <code className="text-neutral-300">DK_ANTHROPIC_API_KEY</code> de la Edge Function dk-ai-insights (Supabase → Edge Functions → Secrets). Nunca se muestra ni viaja al navegador.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className={typography.h3}>Modelos permitidos</h2>
          <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
            Agregar modelo
          </Button>
        </div>
        <DataTable columns={columns} rows={models} getRowId={(m) => m.key} />
      </section>

      <p className={typography.caption}>La voz de cocina usa la voz de cada equipo (sin proveedor externo ni costo). Un proveedor de voz en la nube requeriría su propia Edge Function y secreto.</p>
      {editing && <ModelDrawer model={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
