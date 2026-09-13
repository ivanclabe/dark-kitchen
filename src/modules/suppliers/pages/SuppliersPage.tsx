import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableWrapperClass,
  tdClass,
  thClass,
} from '@/shared/ui/formClasses'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Power, Truck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  useCreateSupplier,
  useSetSupplierActive,
  useSuppliers,
  useUpdateSupplier,
} from '../hooks/useSuppliers'
import type { Supplier } from '../types'

const schema = z.object({
  name: z.string().min(1, 'Requerido'),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  contactName: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = { name: '', taxId: '', phone: '', email: '', address: '', contactName: '' }

export function SuppliersPage() {
  const { data: suppliers, isLoading } = useSuppliers()
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const setActive = useSetSupplierActive()
  const [editingId, setEditingId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  function startEdit(supplier: Supplier) {
    setEditingId(supplier.id)
    reset({
      name: supplier.name,
      taxId: supplier.taxId ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
      contactName: supplier.contactName ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    reset(emptyValues)
  }

  async function onSubmit(values: FormValues) {
    const input = {
      name: values.name,
      taxId: values.taxId || null,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      contactName: values.contactName || null,
    }

    if (editingId) {
      await updateSupplier.mutateAsync({ id: editingId, input })
    } else {
      await createSupplier.mutateAsync(input)
    }
    cancelEdit()
  }

  const submitting = createSupplier.isPending || updateSupplier.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Truck size={22} className="text-brasa-500" />
        <h1 className="text-2xl font-semibold text-neutral-50">Proveedores</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`}>
        <div>
          <label className={labelClass}>Nombre *</label>
          <input {...register('name')} className={inputClass} />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>
        <div>
          <label className={labelClass}>NIT / identificación</label>
          <input {...register('taxId')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Teléfono</label>
          <input {...register('phone')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Correo</label>
          <input {...register('email')} className={inputClass} />
          {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
        </div>
        <div>
          <label className={labelClass}>Contacto</label>
          <input {...register('contactName')} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Dirección</label>
          <input {...register('address')} className={inputClass} />
        </div>

        <div className="flex items-end gap-2 lg:col-span-3">
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {editingId ? <Pencil size={15} /> : <Plus size={15} />}
            {editingId ? 'Guardar cambios' : 'Agregar proveedor'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className={secondaryButtonClass}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className={tableWrapperClass}>
        <table className="min-w-full divide-y divide-neutral-800">
          <thead className="bg-neutral-900">
            <tr>
              <th className={thClass}>Nombre</th>
              <th className={thClass}>NIT</th>
              <th className={thClass}>Teléfono</th>
              <th className={thClass}>Correo</th>
              <th className={thClass}>Estado</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={6}>
                  Cargando…
                </td>
              </tr>
            )}
            {suppliers?.map((supplier) => (
              <tr key={supplier.id} className={supplier.active ? '' : 'opacity-50'}>
                <td className={tdClass}>{supplier.name}</td>
                <td className={tdClass}>{supplier.taxId ?? '—'}</td>
                <td className={tdClass}>{supplier.phone ?? '—'}</td>
                <td className={tdClass}>{supplier.email ?? '—'}</td>
                <td className={tdClass}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${supplier.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-700 text-neutral-300'}`}>
                    {supplier.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className={`${tdClass} space-x-3 text-right`}>
                  <button onClick={() => startEdit(supplier)} className="inline-flex items-center gap-1 text-brasa-500 hover:underline">
                    <Pencil size={13} /> Editar
                  </button>
                  <button
                    onClick={() => setActive.mutate({ id: supplier.id, active: !supplier.active })}
                    className="inline-flex items-center gap-1 text-neutral-400 hover:underline"
                  >
                    <Power size={13} /> {supplier.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
