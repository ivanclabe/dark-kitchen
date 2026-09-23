import { useCreateRider, useRiders, useSetRiderActive } from '@/modules/delivery/hooks/useDelivery'
import type { Role } from '@/shared/rbac/roles'
import { ActiveBadge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { Bike, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'

/** RLS de dk_delivery_riders: solo ADMIN/MANAGER escriben. Antes el formulario se mostraba igual a caja y reparto y fallaba al guardar. */
function canManageRiders(role: Role | null) {
  return role === 'ADMIN' || role === 'MANAGER'
}

/**
 * Domiciliarios — el gestor que vivía en la pantalla Despacho: alta y
 * activar/desactivar. Solo los activos aparecen al despachar un pedido.
 */
export function RidersDrawer({ open, onClose, role }: { open: boolean; onClose: () => void; role: Role | null }) {
  const { data: riders } = useRiders()
  const createRider = useCreateRider()
  const setActive = useSetRiderActive()
  const { show } = useToast()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const canManage = canManageRiders(role)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return
    try {
      await createRider.mutateAsync({ fullName: fullName.trim(), phone: phone || null, vehicleType: vehicleType || null })
      show(`Domiciliario "${fullName.trim()}" agregado.`)
      setFullName('')
      setPhone('')
      setVehicleType('')
    } catch (err) {
      show(getErrorMessage(err, 'Error al agregar el domiciliario'), 'error')
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      await setActive.mutateAsync({ id, active })
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo cambiar el estado del domiciliario'), 'error')
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Domiciliarios" subtitle="Solo los activos aparecen al despachar un pedido" size="md">
      <div className="space-y-5">
        {canManage ? (
          <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-3">
            <FormField label="Nombre" required>
              {(a11y) => <Input {...a11y} value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="off" />}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Teléfono">{(a11y) => <Input {...a11y} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</FormField>
              <FormField label="Vehículo">
                {(a11y) => <Input {...a11y} value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="Moto, bicicleta…" />}
              </FormField>
            </div>
            <Button type="submit" variant="secondary" icon={Plus} loading={createRider.isPending} disabled={!fullName.trim()} className="w-full">
              Agregar domiciliario
            </Button>
          </form>
        ) : (
          <p className={typography.caption}>Solo administración puede agregar o desactivar domiciliarios.</p>
        )}

        {!riders || riders.length === 0 ? (
          <EmptyState icon={Bike} title="Sin domiciliarios" description="Agrega el primero para poder despachar pedidos." compact />
        ) : (
          <ul className="divide-y divide-neutral-800/60">
            {riders.map((r) => (
              <li key={r.id} className={`flex items-center justify-between gap-3 py-2.5 ${r.active ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">{r.fullName}</p>
                  <p className="text-xs text-neutral-500">
                    {[r.phone, r.vehicleType].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <ActiveBadge active={r.active} />
                  {canManage && (
                    <Button variant="link" size="sm" onClick={() => void handleToggle(r.id, !r.active)} disabled={setActive.isPending}>
                      {r.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  )
}
