import { ActiveBadge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, Input } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { ConfirmDialog, Modal } from '@/shared/ui/Modal'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatMoney } from '@/shared/utils/format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { BookOpen, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  assignMasterMenu,
  createMasterMenu,
  deleteMasterMenu,
  deleteMasterProduct,
  listMasterMenus,
  listMasterProducts,
  listUnits,
  saveMasterProduct,
  setMasterMenuActive,
  unassignMasterMenu,
  type MasterMenu,
  type MasterProduct,
} from '../masterMenusApi'
import { MasterProductDrawer } from './MasterProductDrawer'

const MASTER_KEY = ['my-kitchens', 'platform', 'master'] as const

/** Lo mínimo de una Cuenta para compartir un menú con ella. */
export interface MenuAccount {
  id: string
  name: string
}

function NewMenuDialog({ organizationId, onClose, onCreated }: { organizationId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { show } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useMutation({
    mutationFn: () => createMasterMenu(organizationId, name, description),
    onSuccess: onCreated,
    onError: (err) => show(getErrorMessage(err, 'No se pudo crear el menú'), 'error'),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo menú compartido"
      description="Agrega sus platos con receta y actívalo en esta cuenta. Luego puedes usarlo también en tus otras cuentas."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate()}>
            Crear menú
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nombre" required>
          {(a11y) => <Input {...a11y} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Carta Hamburguesas 2026" />}
        </FormField>
        <FormField label="Descripción">
          {(a11y) => <Input {...a11y} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </FormField>
      </div>
    </Modal>
  )
}

function MenuDetail({ menu, account }: { menu: MasterMenu; account: MenuAccount }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data: products, isLoading } = useQuery({ queryKey: [...MASTER_KEY, 'products', menu.id], queryFn: () => listMasterProducts(menu.id) })
  const { data: units } = useQuery({ queryKey: [...MASTER_KEY, 'units'], queryFn: listUnits, staleTime: 60 * 60_000 })
  const [editing, setEditing] = useState<{ product: MasterProduct | null } | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<MasterProduct | null>(null)
  const [deletingMenu, setDeletingMenu] = useState(false)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: MASTER_KEY })
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (err) => show(getErrorMessage(err, 'No se pudo completar la acción'), 'error'),
  })

  const here = menu.kitchenIds.includes(account.id)
  const elsewhere = menu.kitchenIds.length - (here ? 1 : 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={typography.h2}>{menu.name}</h2>
          <p className={typography.caption}>{menu.description ?? 'Sin descripción'}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            Activo
            <Switch checked={menu.active} onChange={(v) => run.mutate(() => setMasterMenuActive(menu.id, v))} label="Menú activo" />
          </label>
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeletingMenu(true)} className="!text-neutral-400 hover:!text-red-400">
            Eliminar menú
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={typography.h3}>Platos</p>
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing({ product: null })} disabled={!units}>
            Agregar plato
          </Button>
        </div>
        {isLoading ? (
          <LoadingState variant="block" />
        ) : !products?.length ? (
          <EmptyState icon={BookOpen} title="Sin platos todavía" description="Agrega los platos con su receta." compact />
        ) : (
          <ul className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800/60">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-100">
                    {p.name} <span className="text-xs font-normal text-neutral-500">· {p.code}</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatMoney(p.price)} · {p.categoryName ?? 'Sin categoría'} · {!p.usesInventory ? 'No usa inventario' : p.recipe.length ? `${p.recipe.length} insumos` : 'Sin receta'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ActiveBadge active={p.active} />
                  <Button variant="link" size="sm" icon={Pencil} onClick={() => setEditing({ product: p })}>
                    Editar
                  </Button>
                  <Button variant="link" size="sm" icon={Trash2} onClick={() => setDeletingProduct(p)} className="!text-neutral-400 hover:!text-red-400">
                    Quitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-neutral-800/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-100">Usar en {account.name}</p>
            <p className={typography.caption}>
              {here ? 'Sus platos están en el catálogo de esta cuenta.' : 'Al activarlo, sus platos se agregan al catálogo de esta cuenta.'}
              {elsewhere > 0 && ` También lo ${elsewhere === 1 ? 'usa otra de tus cuentas' : `usan ${elsewhere} de tus otras cuentas`}: los cambios en sus platos aplican allí también.`}
            </p>
          </div>
          <Switch
            checked={here}
            disabled={run.isPending}
            label={`Usar ${menu.name} en ${account.name}`}
            onChange={(on) =>
              run.mutate(async () => {
                if (on) {
                  await assignMasterMenu(menu.id, [account.id])
                  show('Menú activado en esta cuenta.')
                } else {
                  await unassignMasterMenu(menu.id, [account.id])
                  show('Menú quitado de esta cuenta; sus platos quedan como locales desactivados.')
                }
              })
            }
          />
        </div>
      </section>

      {editing && units && (
        <MasterProductDrawer
          product={editing.product}
          units={units}
          onSave={async (input) => {
            await saveMasterProduct(menu.id, input)
            refresh()
          }}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deletingProduct !== null}
        onClose={() => setDeletingProduct(null)}
        onConfirm={() => deletingProduct && run.mutate(async () => { await deleteMasterProduct(deletingProduct.id); setDeletingProduct(null) })}
        pending={run.isPending}
        danger
        title="Quitar plato del menú"
        confirmLabel="Sí, quitar"
        description={<p>{deletingProduct?.name} sale del menú. En las cuentas queda como plato local desactivado (su historial de pedidos se conserva).</p>}
      />
      <ConfirmDialog
        open={deletingMenu}
        onClose={() => setDeletingMenu(false)}
        onConfirm={() => run.mutate(async () => { await deleteMasterMenu(menu.id); setDeletingMenu(false) })}
        pending={run.isPending}
        danger
        title="Eliminar menú compartido"
        confirmLabel="Sí, eliminar"
        description={<p>Se elimina {menu.name}. Aplica a todas tus cuentas: en las que lo usan, sus platos quedan como locales desactivados.</p>}
      />
    </div>
  )
}

/**
 * Platos compartidos (ADR 0024, D4; master_menus.manage): menus with recipe
 * kept in one place. From an account you create and edit them and decide
 * whether THIS account uses them; nothing about the other accounts is shown
 * beyond how many use each menu.
 */
export function MasterMenusPanel({ organizationId, account }: { organizationId: string; account: MenuAccount }) {
  const queryClient = useQueryClient()
  const { data: menus, isLoading, isError, error, refetch } = useQuery({ queryKey: [...MASTER_KEY, 'menus', organizationId], queryFn: () => listMasterMenus(organizationId) })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const selected = menus?.find((m) => m.id === selectedId) ?? menus?.[0] ?? null

  if (isLoading) return <LoadingState variant="block" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-2">
        <Button variant="secondary" icon={Plus} className="w-full" onClick={() => setCreating(true)}>
          Nuevo menú
        </Button>
        {menus?.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedId(m.id)}
            className={clsx('w-full rounded-xl border px-3 py-2.5 text-left transition-colors', selected?.id === m.id ? 'border-brasa-500/50 bg-brasa-500/5' : 'border-neutral-800/60 hover:bg-neutral-900')}
          >
            <p className="font-medium text-neutral-100">{m.name}</p>
            <p className="text-xs text-neutral-500">
              {m.productCount} platos · {m.kitchenIds.includes(account.id) ? 'en esta cuenta' : 'no está en esta cuenta'}
              {!m.active && ' · inactivo'}
            </p>
          </button>
        ))}
      </aside>
      <div className="min-w-0 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-5">
        {selected ? (
          <MenuDetail key={selected.id} menu={selected} account={account} />
        ) : (
          <EmptyState icon={Layers} title="Todavía no hay platos compartidos" description="Crea un menú, agrega sus platos con receta y actívalo en esta cuenta." compact />
        )}
      </div>
      {creating && (
        <NewMenuDialog
          organizationId={organizationId}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: MASTER_KEY })
            setSelectedId(id)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}
