import { CreateKitchenDialog } from '@/modules/kitchens/components/CreateKitchenDialog'
import { clearActiveKitchen } from '@/app/kitchenEntry'
import { kitchenPath, MY_KITCHENS_KEY } from '@/shared/kitchen/activeKitchenContext'
import { useAuth } from '@/shared/hooks/useAuth'
import { ActiveBadge, Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { EmptyState } from '@/shared/ui/EmptyState'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate } from '@/shared/utils/format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pause, Play, Plus, ShieldCheck, Store, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { listPlatformKitchens, setKitchensActive, type PlatformKitchen } from '../api'

const PLATFORM_KEY = ['my-kitchens', 'platform'] as const

/**
 * Administración de la plataforma (solo superusuario): todas las Cocinas,
 * su actividad, y activar/desactivar una o varias a la vez. Para operar una
 * Cocina se entra a ella (queda en auditoría con la identidad del superusuario).
 */
export function PlatformAdminPage() {
  clearActiveKitchen()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const superadmin = useAuth().profile?.isSuperadmin ?? false
  const { data: kitchens, isLoading, isError, error, refetch } = useQuery({ queryKey: PLATFORM_KEY, queryFn: listPlatformKitchens, enabled: superadmin })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ active: boolean; ids: string[] } | null>(null)
  const [creating, setCreating] = useState(false)

  const toggleActive = useMutation({
    mutationFn: ({ ids, active }: { ids: string[]; active: boolean }) => setKitchensActive(ids, active),
    onSuccess: (count, { active }) => {
      void queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      show(`${count} ${count === 1 ? 'cuenta' : 'cuentas'} ${active ? 'activada' : 'desactivada'}${count === 1 ? '' : 's'}.`)
      setSelected(new Set())
      setConfirm(null)
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo actualizar'), 'error'),
  })

  if (!superadmin) return <Navigate to="/cuentas" replace />

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allIds = kitchens?.map((k) => k.id) ?? []
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  const columns: DataTableColumn<PlatformKitchen>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          aria-label="Seleccionar todas"
          checked={allSelected}
          onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))}
          className="size-4 accent-[var(--color-brasa-500)]"
        />
      ),
      cell: (k) => <input type="checkbox" aria-label={`Seleccionar ${k.name}`} checked={selected.has(k.id)} onChange={() => toggleRow(k.id)} className="size-4 accent-[var(--color-brasa-500)]" />,
    },
    {
      key: 'name',
      header: 'Cuenta',
      cell: (k) => (
        <div>
          <p className="font-medium text-neutral-100">{k.name}</p>
          <p className="text-xs text-neutral-500">/k/{k.slug}</p>
        </div>
      ),
    },
    { key: 'organization', header: 'Organización', hideBelow: 'md', cell: (k) => <span className="text-neutral-300">{k.organizationName}</span> },
    { key: 'status', header: 'Estado', cell: (k) => <ActiveBadge active={k.active} /> },
    {
      key: 'team',
      header: 'Equipo',
      cell: (k) => (
        <span className="inline-flex items-center gap-2 text-neutral-300">
          {k.membersActive}
          {k.admins === 0 && (
            <Badge tone="warning" size="sm" icon={TriangleAlert}>
              Sin administrador
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'orders', header: 'Pedidos 30 d', cell: (k) => <span className="tabular-nums text-neutral-300">{k.orders30d}</span>, hideBelow: 'md' },
    { key: 'last', header: 'Último pedido', cell: (k) => <span className="text-neutral-400">{k.lastOrderAt ? formatDate(k.lastOrderAt) : '—'}</span>, hideBelow: 'lg' },
    {
      key: 'actions',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      cell: (k) => (
        <Link to={kitchenPath(k.slug, '/')} className="text-sm text-brasa-400 hover:underline">
          Entrar
        </Link>
      ),
    },
  ]

  const selectedIds = [...selected]

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-10 text-neutral-100 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link to="/cuentas" className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100">
          <ArrowLeft size={14} aria-hidden /> Mis cuentas
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className={`flex items-center gap-2 ${typography.h1}`}>
              <ShieldCheck size={22} className="text-brasa-400" aria-hidden /> Plataforma
            </h1>
            <p className={typography.small}>Todas las cuentas de todas las organizaciones. Los menús maestros se administran en cada organización.</p>
          </div>
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Nueva cuenta
          </Button>
        </header>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brasa-500/30 bg-brasa-500/5 px-4 py-2.5 text-sm">
            <span className="mr-auto text-neutral-200">{selectedIds.length} seleccionadas</span>
            <Button size="sm" variant="secondary" icon={Play} onClick={() => setConfirm({ active: true, ids: selectedIds })}>
              Activar
            </Button>
            <Button size="sm" variant="danger" icon={Pause} onClick={() => setConfirm({ active: false, ids: selectedIds })}>
              Desactivar
            </Button>
          </div>
        )}

        {(
          <DataTable
            columns={columns}
            rows={kitchens}
            getRowId={(k) => k.id}
            isLoading={isLoading}
            error={isError ? error : undefined}
            onRetry={() => void refetch()}
            emptyState={<EmptyState icon={Store} title="Todavía no hay cuentas" compact />}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggleActive.mutate(confirm)}
        pending={toggleActive.isPending}
        danger={confirm?.active === false}
        title={confirm?.active ? 'Activar cuentas' : 'Desactivar cuentas'}
        confirmLabel={confirm?.active ? 'Sí, activar' : 'Sí, desactivar'}
        description={
          confirm?.active ? (
            <p>Sus equipos vuelven a poder operarlas de inmediato.</p>
          ) : (
            <p>Sus equipos dejan de poder operarlas de inmediato (pedidos, inventario, todo). Los datos se conservan y puedes reactivarlas cuando quieras.</p>
          )
        }
      />
      {creating && (
        <CreateKitchenDialog
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            void queryClient.invalidateQueries({ queryKey: PLATFORM_KEY })
            navigate(kitchenPath(slug, '/'))
          }}
        />
      )}
    </div>
  )
}
