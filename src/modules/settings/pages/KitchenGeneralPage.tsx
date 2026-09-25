import { AccountIcon } from '@/shared/avatars/Avatar'
import { resolveAccountIconKey } from '@/shared/avatars/catalog'
import { AccountIconPicker } from '@/shared/avatars/GalleryPicker'
import { MY_KITCHENS_KEY, kitchenPath, useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { getKitchenDetails, updateKitchenDetails, type KitchenDetailsInput } from '@/shared/kitchen/kitchensApi'
import { slugError } from '@/shared/kitchen/slug'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormActions, FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Copy, Link2, Plug } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { value: 'America/Lima', label: 'Perú (Lima)' },
  { value: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
  { value: 'America/Caracas', label: 'Venezuela (Caracas)' },
  { value: 'America/Panama', label: 'Panamá' },
  { value: 'America/Mexico_City', label: 'México (Ciudad de México)' },
  { value: 'America/Santiago', label: 'Chile (Santiago)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { value: 'America/New_York', label: 'Estados Unidos (Nueva York)' },
  { value: 'Europe/Madrid', label: 'España (Madrid)' },
]

/**
 * Datos generales de la Cocina activa. El Administrador (settings:manage)
 * edita nombre, identificador y datos del negocio; activar o desactivar la
 * Cocina es solo del superusuario (lo impide la base).
 */
export function KitchenGeneralPage() {
  const { kitchen, can } = useActiveKitchen()
  const canEdit = can('settings.manage')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { show } = useToast()
  const { data: details, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['kitchen-details', kitchen.id],
    queryFn: () => getKitchenDetails(kitchen.id),
  })

  const [edited, setEdited] = useState<KitchenDetailsInput | null>(null)
  const saved: KitchenDetailsInput | null = details
    ? {
        name: details.name,
        slug: details.slug,
        legalName: details.legalName,
        taxId: details.taxId,
        phone: details.phone,
        address: details.address,
        timezone: details.timezone,
        iconKey: details.iconKey,
      }
    : null
  const form = edited ?? saved

  const save = useMutation({
    mutationFn: (input: KitchenDetailsInput) => updateKitchenDetails(kitchen.id, input),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      await queryClient.invalidateQueries({ queryKey: ['kitchen-details', kitchen.id] })
      setEdited(null)
      show('Datos de la cuenta guardados.')
      // El identificador es parte de la URL: si cambió, se sigue en la dirección nueva.
      if (input.slug !== kitchen.slug) navigate(kitchenPath(input.slug, '/settings/general'), { replace: true })
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'No se pudieron guardar los datos')
      show(message.includes('dk_kitchens_slug_key') ? 'Ese identificador ya lo usa otra cuenta.' : message, 'error')
    },
  })

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !form) return <ErrorState error={error} onRetry={() => void refetch()} />

  const nameError = form.name.trim().length >= 2 ? null : 'Mínimo 2 caracteres'
  const slugProblem = slugError(form.slug)
  const set = (patch: Partial<KitchenDetailsInput>) => setEdited({ ...form, ...patch })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form && !nameError && !slugProblem) save.mutate(form)
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
      <Card title="Identidad" description="Cómo se ve esta cuenta en la app y en su dirección" icon={Building2}>
        <FormGrid>
          <FormField label="Nombre" required error={edited ? nameError : null}>
            {(a11y) => <Input {...a11y} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} disabled={!canEdit} />}
          </FormField>
          <FormField
            label="Identificador (URL)"
            required
            error={edited ? slugProblem : null}
            hint={
              <span className="inline-flex items-center gap-1">
                <Link2 size={11} aria-hidden /> /k/{form.slug || '…'} — cambiarlo cambia los enlaces de esta cocina.
              </span>
            }
          >
            {(a11y) => (
              <Input {...a11y} value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} maxLength={60} disabled={!canEdit} />
            )}
          </FormField>
        </FormGrid>
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3">
            <AccountIcon iconKey={form.iconKey} seed={kitchen.id} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-200">Icono de la cuenta</p>
              <p className={typography.caption}>Representa al establecimiento en el selector de cuentas y en la organización.</p>
            </div>
          </div>
          {canEdit && <AccountIconPicker value={resolveAccountIconKey(form.iconKey, kitchen.id)} onChange={(iconKey) => set({ iconKey })} />}
        </div>
      </Card>

      <Card title="Datos del negocio" description="Opcionales: aparecen en documentos y soporte" icon={Building2}>
        <FormGrid>
          <FormField label="Razón social">
            {(a11y) => <Input {...a11y} value={form.legalName ?? ''} onChange={(e) => set({ legalName: e.target.value })} disabled={!canEdit} />}
          </FormField>
          <FormField label="NIT / identificación">
            {(a11y) => <Input {...a11y} value={form.taxId ?? ''} onChange={(e) => set({ taxId: e.target.value })} disabled={!canEdit} />}
          </FormField>
          <FormField label="Teléfono">
            {(a11y) => <Input {...a11y} type="tel" value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} disabled={!canEdit} />}
          </FormField>
          <FormField label="Dirección">
            {(a11y) => <Input {...a11y} value={form.address ?? ''} onChange={(e) => set({ address: e.target.value })} disabled={!canEdit} />}
          </FormField>
          <FormField label="Zona horaria" hint="Define el “hoy” de la cuenta: menú del día, ventas de hoy y horario.">
            {(a11y) => (
              <Select {...a11y} value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} disabled={!canEdit}>
                {!TIMEZONES.some((t) => t.value === form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
                {TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </FormGrid>
      </Card>

      <Card
        title="Integraciones"
        description="Para conectar sistemas externos (p. ej. pedidos por WhatsApp con n8n) a esta cuenta"
        icon={Plug}
      >
        <FormField
          label="ID de la cuenta"
          hint={
            <>
              Cada integración envía este valor en el encabezado <code className="text-neutral-300">x-dk-kitchen-id</code>. Sin él no ve ni registra nada.
            </>
          }
        >
          {(a11y) => (
            <div className="flex gap-2">
              <Input {...a11y} value={kitchen.id} readOnly className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button
                variant="secondary"
                icon={Copy}
                onClick={() =>
                  navigator.clipboard.writeText(kitchen.id).then(
                    () => show('ID de la cuenta copiado.'),
                    () => show('No se pudo copiar; selecciónalo y cópialo a mano.', 'error'),
                  )
                }
              >
                Copiar
              </Button>
            </div>
          )}
        </FormField>
      </Card>

      {canEdit ? (
        <FormActions>
          {edited && (
            <Button variant="ghost" onClick={() => setEdited(null)} disabled={save.isPending}>
              Descartar
            </Button>
          )}
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!edited || Boolean(nameError || slugProblem)}>
            Guardar cambios
          </Button>
        </FormActions>
      ) : (
        <p className={typography.caption}>Solo el administrador de la cuenta puede cambiar estos datos.</p>
      )}
    </form>
  )
}
