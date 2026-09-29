import { MY_KITCHENS_KEY } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormActions, FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { updateOrganization, type OrganizationDetails, type OrganizationInput } from '../api/organization'
import { orgKey } from '../hooks/useOrganization'
import { CATEGORIES, COUNTRIES, SECTORS } from '../lib/business'

/** Datos del negocio (nivel organización, ADR 0012): nombre, sector, legales, moneda por defecto. */
export function OrgGeneralForm({ org }: { org: OrganizationDetails }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const saved: OrganizationInput = {
    name: org.name,
    address: org.address,
    city: org.city,
    country: org.country,
    sector: org.sector,
    category: org.category,
    legalName: org.legalName,
    taxId: org.taxId,
    phone: org.phone,
    currency: org.currency,
    defaultTimezone: org.defaultTimezone,
  }
  const [edited, setEdited] = useState<OrganizationInput | null>(null)
  const form = edited ?? saved
  const set = (patch: Partial<OrganizationInput>) => setEdited({ ...form, ...patch })
  const nameError = form.name.trim().length >= 2 ? null : 'Mínimo 2 caracteres'

  const save = useMutation({
    mutationFn: () => updateOrganization(org.id, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(org.id) })
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      setEdited(null)
      show('Datos de la organización guardados.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudieron guardar los datos'), 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (edited && !nameError) save.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-5">
      <Card title="Tu negocio" description="Así se identifica tu organización en Quanela" icon={Building2}>
        <FormGrid>
          <FormField label="Nombre" required error={edited ? nameError : null}>
            {(a11y) => <Input {...a11y} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} />}
          </FormField>
          <FormField label="Sector">
            {(a11y) => (
              <Select {...a11y} value={form.sector ?? ''} onChange={(e) => set({ sector: e.target.value || null })}>
                <option value="">Sin definir</option>
                {SECTORS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Categoría">
            {(a11y) => (
              <Select {...a11y} value={form.category ?? ''} onChange={(e) => set({ category: e.target.value || null })}>
                <option value="">Sin definir</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="País">
            {(a11y) => (
              <Select {...a11y} value={form.country} onChange={(e) => set({ country: e.target.value })}>
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Ciudad">{(a11y) => <Input {...a11y} value={form.city ?? ''} onChange={(e) => set({ city: e.target.value })} />}</FormField>
          <FormField label="Dirección">{(a11y) => <Input {...a11y} value={form.address ?? ''} onChange={(e) => set({ address: e.target.value })} />}</FormField>
        </FormGrid>
      </Card>
      <Card title="Datos legales y de contacto" description="Opcionales" icon={Building2}>
        <FormGrid>
          <FormField label="Razón social">{(a11y) => <Input {...a11y} value={form.legalName ?? ''} onChange={(e) => set({ legalName: e.target.value })} />}</FormField>
          <FormField label="NIT / identificación">{(a11y) => <Input {...a11y} value={form.taxId ?? ''} onChange={(e) => set({ taxId: e.target.value })} />}</FormField>
          <FormField label="Teléfono">{(a11y) => <Input {...a11y} type="tel" value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />}</FormField>
          <FormField label="Moneda" hint="Para las cuentas nuevas">
            {(a11y) => <Input {...a11y} value={form.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} />}
          </FormField>
        </FormGrid>
      </Card>
      <FormActions>
        {edited && (
          <Button variant="ghost" onClick={() => setEdited(null)} disabled={save.isPending}>
            Descartar
          </Button>
        )}
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!edited || Boolean(nameError)}>
          Guardar cambios
        </Button>
      </FormActions>
    </form>
  )
}
