import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Combobox } from '@/shared/ui/Combobox'
import { FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { AlertTriangle, Plus, Sparkles, Truck } from 'lucide-react'
import { useState } from 'react'
import { reasonLabel } from '../lib/invoiceReview'
import type { Extraction, InvoiceMatch, SupplierChoice } from '../types/invoiceImport'
import type { Supplier } from '../types'

/**
 * The supplier of the invoice (ADR 0049): the match the database found (and
 * why), another existing one, or a new one with what the invoice says. A new
 * one is checked again by NIT when saving: it is never duplicated.
 */
export function SupplierChoiceCard({
  extraction,
  match,
  suppliers,
  value,
  canCreate,
  onChange,
}: {
  extraction: Extraction
  match: InvoiceMatch
  suppliers: Supplier[]
  value: SupplierChoice | null
  canCreate: boolean
  onChange: (choice: SupplierChoice | null) => void
}) {
  const [picking, setPicking] = useState(false)
  const read = extraction.supplier
  const chosen = value?.kind === 'existing' ? suppliers.find((s) => s.id === value.id) : null
  const candidate = value?.kind === 'existing' ? match.suppliers.find((c) => c.id === value.id) : null
  const options = suppliers.map((s) => ({ value: s.id, label: s.name, sublabel: [s.taxId && `NIT ${s.taxId}`, !s.active && 'inactivo'].filter(Boolean).join(' · ') || undefined }))

  function createFromInvoice() {
    setPicking(false)
    onChange({ kind: 'new', name: read.name ?? '', taxId: read.taxId ?? '', phone: read.phone ?? '', email: read.email ?? '', address: read.address ?? '' })
  }

  return (
    <Card title="Proveedor" icon={Truck}>
      <div className="space-y-3">
        <p className="text-xs text-neutral-500">
          En la factura: <span className="text-neutral-300">{read.name ?? 'sin nombre'}</span>
          {read.taxId && <span className="text-neutral-300"> · NIT {read.taxId}</span>}
          {extraction.confidence.supplier !== 'alta' && <span className="text-amber-400"> · leído con dudas</span>}
        </p>

        {value?.kind === 'new' ? (
          <div className="space-y-3 rounded-xl border border-brasa-500/30 bg-brasa-500/5 p-3">
            <p className="text-sm font-medium text-neutral-100">Proveedor nuevo</p>
            <FormGrid>
              <FormField label="Nombre" required>
                {(a11y) => <Input {...a11y} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />}
              </FormField>
              <FormField label="NIT o identificación">
                {(a11y) => <Input {...a11y} value={value.taxId} onChange={(e) => onChange({ ...value, taxId: e.target.value })} />}
              </FormField>
              <FormField label="Teléfono">
                {(a11y) => <Input {...a11y} value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />}
              </FormField>
              <FormField label="Correo">
                {(a11y) => <Input {...a11y} value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />}
              </FormField>
              <FormField label="Dirección" className="sm:col-span-2">
                {(a11y) => <Input {...a11y} value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />}
              </FormField>
            </FormGrid>
            <p className="text-xs text-neutral-400">
              Se crea al guardar. Si ya tienes un proveedor con ese NIT, se usa ese.{' '}
              <button type="button" onClick={() => onChange(null)} className="font-medium text-brasa-400 hover:underline">
                Elegir uno existente
              </button>
            </p>
          </div>
        ) : chosen && !picking ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-100">{chosen.name}</p>
              <p className="text-xs text-neutral-500">{chosen.taxId ? `NIT ${chosen.taxId}` : 'Sin NIT registrado'}</p>
              {candidate && (
                <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                  <Sparkles size={12} className="text-brasa-400" aria-hidden /> Sugerido: {reasonLabel(candidate.reason, candidate.score)}
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Combobox
              aria-label="Proveedor"
              value={value?.kind === 'existing' ? value.id : ''}
              onChange={(id) => {
                setPicking(false)
                onChange(id ? { kind: 'existing', id } : null)
              }}
              options={options}
              placeholder="Busca el proveedor…"
            />
            {match.suppliers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-neutral-500">Parecidos:</span>
                {match.suppliers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPicking(false)
                      onChange({ kind: 'existing', id: c.id })
                    }}
                    className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:border-brasa-500/60 hover:bg-brasa-500/5"
                  >
                    {c.name} <span className="text-neutral-500">· {reasonLabel(c.reason, c.score)}</span>
                    {c.taxIdDiffers && <span className="text-amber-400"> · otro NIT</span>}
                  </button>
                ))}
              </div>
            )}
            {canCreate && (
              <Button variant="ghost" size="sm" icon={Plus} onClick={createFromInvoice}>
                Crear proveedor con los datos de la factura
              </Button>
            )}
          </div>
        )}

        {match.suppliers.some((c) => c.taxIdDiffers && c.id === (value?.kind === 'existing' ? value.id : null)) && (
          <p className="flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle size={13} aria-hidden /> Este proveedor tiene otro NIT registrado. Revisa que sea el mismo.
          </p>
        )}
        {!value && <Badge tone="warning">Elige o crea el proveedor</Badge>}
      </div>
    </Card>
  )
}
