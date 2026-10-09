import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Switch } from '@/shared/ui/Switch'
import { typography } from '@/shared/ui/typography'
import clsx from 'clsx'
import { Building2, Star, UserRound } from 'lucide-react'
import { emailError, normalizeEmail } from '@/shared/utils/email'
import { EmailInput } from '@/shared/ui/EmailInput'
import { toE164 } from '@/shared/utils/phone'
import { PhoneInput } from '@/shared/ui/PhoneInput'
import { phoneError } from '@/shared/utils/phone'
import { FormField, Input, Textarea } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage, isUniqueViolation } from '@/shared/utils/errors'
import { useState, type FormEvent } from 'react'
import { useCreateCustomer, useUpdateCustomer } from '../hooks/useCustomers'
import type { Customer, CustomerInput, CustomerType } from '../types'

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
/** Persona / Empresa (ADR 0044): a radio group, one choice visible at a glance. */
function TypeChoice({ value, onChange }: { value: CustomerType; onChange: (type: CustomerType) => void }) {
  const options: { type: CustomerType; label: string; icon: typeof UserRound }[] = [
    { type: 'person', label: 'Persona', icon: UserRound },
    { type: 'company', label: 'Empresa', icon: Building2 },
  ]
  return (
    <div role="radiogroup" aria-label="Tipo de cliente" className="inline-flex rounded-xl border border-neutral-800 bg-neutral-950 p-1">
      {options.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={value === type}
          onClick={() => onChange(type)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none',
            value === type ? 'bg-neutral-800 font-medium text-neutral-50' : 'text-neutral-400 hover:text-neutral-200',
          )}
        >
          <Icon size={14} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}

/** A repeated phone or tax id: which one, in plain words. */
function duplicateMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : ''
  return raw.includes('tax_id') ? 'Ya hay un cliente con ese NIT o documento en esta cuenta. Búscalo en la lista.' : 'Ya hay un cliente con ese teléfono en esta cuenta. Búscalo en la lista.'
}

function CustomerForm({ customer, initialQuery = '', onClose, onSaved }: FormProps) {
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const { show } = useToast()
  const { can } = useActiveKitchen()
  // ADR 0044: who edits customers marks one preferred (the database checks it too).
  const canMarkPreferred = can('customers.edit')
  const [type, setType] = useState<CustomerType>(customer?.type ?? 'person')
  const company = type === 'company'
  const [legalName, setLegalName] = useState(customer?.legalName ?? '')
  const [taxId, setTaxId] = useState(customer?.taxId ?? '')
  const [contactName, setContactName] = useState(customer?.contactName ?? '')
  const [preferred, setPreferred] = useState(customer?.preferred ?? false)
  const [preferredNote, setPreferredNote] = useState(customer?.preferredNote ?? '')
  const [fullName, setFullName] = useState(() => customer?.fullName ?? (looksLikePhone(initialQuery) ? '' : initialQuery))
  const [phone, setPhone] = useState(() => customer?.phone ?? (looksLikePhone(initialQuery) ? (toE164('CO', initialQuery) ?? initialQuery) : ''))
  const phoneProblem = phoneError(phone, { original: customer?.phone })
  const [email, setEmail] = useState(customer?.email ?? '')
  const emailProblem = emailError(email)
  const [address, setAddress] = useState(customer?.address ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const pending = createCustomer.isPending || updateCustomer.isPending

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (phoneProblem || emailProblem) return
    const input: CustomerInput = {
      fullName: fullName.trim(),
      phone: phone.trim() || null,
      email: normalizeEmail(email) || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      type,
      // A person keeps no company fields (they stay only while typing, if you switch back).
      legalName: company ? legalName.trim() || null : null,
      taxId: taxId.trim() || null,
      contactName: company ? contactName.trim() || null : null,
      preferred,
      preferredNote: preferred ? preferredNote.trim() || null : null,
    }
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
      setError(isUniqueViolation(err) ? duplicateMessage(err) : getErrorMessage(err, customer ? 'Error al actualizar el cliente' : 'Error al crear el cliente'))
    }
  }

  return (
    <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
      <TypeChoice value={type} onChange={setType} />
      <FormField
        label={company ? 'Nombre comercial' : 'Nombre'}
        required
        error={error}
        info={company ? 'Como la conocen: es el nombre que se ve en pedidos, despacho y cartera.' : undefined}
      >
        {(a11y) => <Input {...a11y} value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus autoComplete={company ? 'organization' : 'name'} maxLength={120} />}
      </FormField>
      {company && (
        <>
          <FormField label="Razón social">
            {(a11y) => <Input {...a11y} value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={150} placeholder="Oficinas Andinas S.A.S." />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="NIT" info="No se repite en la cuenta, aunque se escriba con o sin puntos y guion.">
              {(a11y) => <Input {...a11y} value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={30} placeholder="900.123.456-7" inputMode="text" />}
            </FormField>
            <FormField label="Persona de contacto">
              {(a11y) => <Input {...a11y} value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120} autoComplete="name" />}
            </FormField>
          </div>
        </>
      )}
      {!company && (
        <FormField label="Documento" hint="Opcional, por ejemplo para facturar.">
          {(a11y) => <Input {...a11y} value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={30} className="sm:max-w-56" />}
        </FormField>
      )}
      <FormField label="Teléfono" error={phoneProblem} info="Con este número reconocemos al cliente cuando pide por WhatsApp, y no se repite en la cuenta.">
        {(a11y) => <PhoneInput {...a11y} value={phone} onValueChange={setPhone} />}
      </FormField>
      <FormField label="Correo" error={email ? emailProblem : null}>
        {(a11y) => <EmailInput {...a11y} value={email} onValueChange={setEmail} placeholder="cliente@correo.com" autoComplete="off" />}
      </FormField>
      <FormField label="Dirección de envío" info="Queda como su última dirección de envío. Las anteriores se guardan en su ficha, en Direcciones.">{(a11y) => <Input {...a11y} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />}</FormField>
      <FormField label="Notas">{(a11y) => <Textarea {...a11y} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</FormField>
      {canMarkPreferred && (
        <div className="space-y-3 rounded-xl border border-neutral-800/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm text-neutral-200">
                <Star size={14} className="text-amber-400" aria-hidden /> Cliente preferencial
              </p>
              <p className={typography.caption}>Se ve con una estrella en la lista, en su ficha y al tomarle un pedido. No cambia precios.</p>
            </div>
            <Switch checked={preferred} onChange={setPreferred} label="Cliente preferencial" />
          </div>
          {preferred && (
            <FormField label="Motivo" hint="Opcional: por qué es preferencial.">
              {(a11y) => <Input {...a11y} value={preferredNote} onChange={(e) => setPreferredNote(e.target.value)} maxLength={200} placeholder="Convenio corporativo, descuento del 10 %…" />}
            </FormField>
          )}
        </div>
      )}
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
