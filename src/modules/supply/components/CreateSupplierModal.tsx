import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
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

// Componente hijo separado: solo se instancia mientras open=true, así cada
// apertura es un montaje nuevo y los campos parten limpios.
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
      <FormField label="Nombre" required error={error}>
        {(a11y) => <Input {...a11y} value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="organization" />}
      </FormField>
      <FormField label="Teléfono">{(a11y) => <Input {...a11y} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />}</FormField>
      <FormField label="Contacto">{(a11y) => <Input {...a11y} value={contactName} onChange={(e) => setContactName(e.target.value)} />}</FormField>
      <p className={typography.caption}>NIT, correo y dirección se pueden completar después desde Proveedores.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={createSupplier.isPending}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={createSupplier.isPending}>
          Crear proveedor
        </Button>
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
