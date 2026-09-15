import { Modal } from '@/shared/ui/Modal'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { useCreateSupplier } from '../hooks/useSuppliers'
import type { Supplier } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  initialQuery: string
  onCreated: (supplier: Supplier) => void
}

function CreateSupplierForm({ initialQuery, onClose, onCreated }: Omit<Props, 'open'>) {
  const createSupplier = useCreateSupplier()
  const { show } = useToast()
  const [name, setName] = useState(initialQuery)
  const [phone, setPhone] = useState('')
  const [contactName, setContactName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const supplier = await createSupplier.mutateAsync({
        name,
        phone: phone || null,
        contactName: contactName || null,
      })
      show(`Proveedor "${supplier.name}" creado.`)
      onCreated(supplier)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear el proveedor'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Nombre *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required autoFocus />
      </div>
      <div>
        <label className={labelClass}>Teléfono</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Contacto</label>
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
      </div>
      <p className="text-xs text-neutral-500">
        NIT, correo y dirección se pueden completar después desde Proveedores.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={createSupplier.isPending} className={primaryButtonClass}>
          {createSupplier.isPending ? 'Creando…' : 'Crear proveedor'}
        </button>
      </div>
    </form>
  )
}

export function CreateSupplierModal({ open, onClose, initialQuery, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Crear proveedor">
      {open && <CreateSupplierForm initialQuery={initialQuery} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  )
}
