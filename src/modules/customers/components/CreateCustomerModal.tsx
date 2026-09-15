import { Modal } from '@/shared/ui/Modal'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/shared/ui/formClasses'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { useCreateCustomer } from '../hooks/useCustomers'
import type { Customer } from '../types'

/** Detecta si el texto escrito parece un teléfono (mayoría dígitos) en vez de un nombre. */
function looksLikePhone(text: string) {
  const digits = text.replace(/\D/g, '')
  return digits.length >= 6 && digits.length / text.length > 0.6
}

interface Props {
  open: boolean
  onClose: () => void
  initialQuery: string
  onCreated: (customer: Customer) => void
}

// Componente hijo separado (en vez de estado local en CreateCustomerModal):
// solo se instancia mientras open=true, así cada apertura es un montaje
// nuevo y los campos parten limpios de initialQuery sin necesitar un efecto
// para resetearlos.
function CreateCustomerForm({ initialQuery, onClose, onCreated }: Omit<Props, 'open'>) {
  const createCustomer = useCreateCustomer()
  const { show } = useToast()
  const [fullName, setFullName] = useState(() => (looksLikePhone(initialQuery) ? '' : initialQuery))
  const [phone, setPhone] = useState(() => (looksLikePhone(initialQuery) ? initialQuery : ''))
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const customer = await createCustomer.mutateAsync({
        fullName,
        phone: phone || null,
        address: address || null,
      })
      show(`Cliente "${customer.fullName}" creado.`)
      onCreated(customer)
    } catch (err) {
      setError(getErrorMessage(err, 'Error al crear el cliente'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Nombre *</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} required autoFocus />
      </div>
      <div>
        <label className={labelClass}>Teléfono</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Dirección</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="submit" disabled={createCustomer.isPending} className={primaryButtonClass}>
          {createCustomer.isPending ? 'Creando…' : 'Crear cliente'}
        </button>
      </div>
    </form>
  )
}

export function CreateCustomerModal({ open, onClose, initialQuery, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Crear cliente">
      {open && <CreateCustomerForm initialQuery={initialQuery} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  )
}
