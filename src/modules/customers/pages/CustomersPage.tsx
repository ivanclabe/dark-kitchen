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
import { Pencil, Plus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useCreateCustomer, useCustomers, useUpdateCustomer } from '../hooks/useCustomers'
import type { Customer } from '../types'

const emptyValues = { fullName: '', phone: '', address: '', notes: '' }

export function CustomersPage() {
  const { data: customers, isLoading } = useCustomers()
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [values, setValues] = useState(emptyValues)

  function startEdit(customer: Customer) {
    setEditingId(customer.id)
    setValues({
      fullName: customer.fullName,
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setValues(emptyValues)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const input = {
      fullName: values.fullName,
      phone: values.phone || null,
      address: values.address || null,
      notes: values.notes || null,
    }
    if (editingId) {
      await updateCustomer.mutateAsync({ id: editingId, input })
    } else {
      await createCustomer.mutateAsync(input)
    }
    cancelEdit()
  }

  const submitting = createCustomer.isPending || updateCustomer.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users size={22} className="text-brasa-500" />
        <h1 className="text-2xl font-semibold text-neutral-50">Clientes</h1>
      </div>

      <form onSubmit={handleSubmit} className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <label className={labelClass}>Nombre *</label>
          <input
            value={values.fullName}
            onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Teléfono</label>
          <input
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Dirección</label>
          <input
            value={values.address}
            onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Notas</label>
          <input
            value={values.notes}
            onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {editingId ? <Pencil size={15} /> : <Plus size={15} />}
            {editingId ? 'Guardar cambios' : 'Agregar cliente'}
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
              <th className={thClass}>Teléfono</th>
              <th className={thClass}>Dirección</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {isLoading && (
              <tr>
                <td className={tdClass} colSpan={4}>
                  Cargando…
                </td>
              </tr>
            )}
            {customers?.map((customer) => (
              <tr key={customer.id}>
                <td className={tdClass}>{customer.fullName}</td>
                <td className={tdClass}>{customer.phone ?? '—'}</td>
                <td className={tdClass}>{customer.address ?? '—'}</td>
                <td className={`${tdClass} text-right`}>
                  <button onClick={() => startEdit(customer)} className="inline-flex items-center gap-1 text-brasa-500 hover:underline">
                    <Pencil size={13} /> Editar
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
