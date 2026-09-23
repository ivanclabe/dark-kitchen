import { Button } from '@/shared/ui/Button'
import { FormField, Input, Textarea } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { useCreateCustomer, useUpdateCustomer } from '../hooks/useCustomers'
import type { Customer } from '../types'

/** Detecta si el texto escrito parece un teléfono (mayoría dígitos) en vez de un nombre. */
function looksLikePhone(text: string) {
  const digits = text.replace(/\D/g, '')
  return digits.length >= 6 && digits.length / text.length > 0.6
}

interface FormProps {
  /** Cliente a editar; si no viene, el formulario crea uno nuevo. */
  customer?: Customer
  initialQuery?: string
  onClose: () => void
  onSaved?: (customer: Customer) => void
}

// Componente hijo separado (en vez de estado local en el modal): solo se
// instancia mientras open=true, así cada apertura es un montaje nuevo y los
// campos parten limpios sin necesitar un efecto para resetearlos.
function CustomerForm({ customer, initialQuery = '', onClose, onSaved }: FormProps) {
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const { show } = useToast()
  const [fullName, setFullName] = useState(() => customer?.fullName ?? (looksLikePhone(initialQuery) ? '' : initialQuery))
  const [phone, setPhone] = useState(() => customer?.phone ?? (looksLikePhone(initialQuery) ? initialQuery : ''))
  const [address, setAddress] = useState(customer?.address ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const pending = createCustomer.isPending || updateCustomer.isPending

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const input = { fullName: fullName.trim(), phone: phone.trim() || null, address: address.trim() || null, notes: notes.trim() || null }
    try {
      if (customer) {
        await updateCustomer.mutateAsync({ id: customer.id, input })
        show(`Cliente "${input.fullName}" actualizado.`)
        onSaved?.({ ...customer, ...input })
      } else {
        const created = await createCustomer.mutateAsync(input)
        show(`Cliente "${created.fullName}" creado.`)
        onSaved?.(created)
      }
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, customer ? 'Error al actualizar el cliente' : 'Error al crear el cliente'))
    }
  }

  return (
    <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Nombre" required error={error}>
        {(a11y) => <Input {...a11y} value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus autoComplete="name" />}
      </FormField>
      <FormField label="Teléfono" hint="Se usa para reconocer al cliente en pedidos por WhatsApp.">
        {(a11y) => <Input {...a11y} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />}
      </FormField>
      <FormField label="Dirección">{(a11y) => <Input {...a11y} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />}</FormField>
      <FormField label="Notas">{(a11y) => <Textarea {...a11y} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {customer ? 'Guardar cambios' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  )
}

/** Alta y edición de clientes en un mismo modal. */
export function CustomerFormModal({ open, customer, initialQuery, onClose, onSaved }: FormProps & { open: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={customer ? 'Editar cliente' : 'Nuevo cliente'} description={customer ? customer.fullName : undefined}>
      {open && <CustomerForm customer={customer} initialQuery={initialQuery} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  )
}

/** Compatibilidad: el picker de Pedidos sigue usando esta firma (crear desde texto buscado). */
export function CreateCustomerModal({
  open,
  onClose,
  initialQuery,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  initialQuery: string
  onCreated: (customer: Customer) => void
}) {
  return <CustomerFormModal open={open} initialQuery={initialQuery} onClose={onClose} onSaved={onCreated} />
}
