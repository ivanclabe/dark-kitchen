import { OrgGeneralForm } from '@/modules/organization/components/OrgGeneralForm'
import { PhoneInput } from '@/shared/ui/PhoneInput'
import { phoneError } from '@/shared/utils/phone'
import { useOrganizationDetails } from '@/modules/organization/hooks/useOrganization'
import { AccountIcon } from '@/shared/avatars/Avatar'
import { resolveAccountIconKey } from '@/shared/avatars/catalog'
import { AccountIconPicker } from '@/shared/avatars/GalleryPicker'
import { MY_KITCHENS_KEY, kitchenPath, useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { getKitchenDetails, updateKitchenDetails, type KitchenDetailsInput } from '@/shared/kitchen/kitchensApi'
import { slugError } from '@/shared/kitchen/slug'
import { ErrorState } from '@/shared/ui/ErrorState'
import { FormField, FormGrid, Input, Select } from '@/shared/ui/FormField'
import { LoadingState } from '@/shared/ui/LoadingState'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccountStatusCard } from '../components/AccountStatusCard'
import { SettingsPage } from '../ui/SettingsPage'
import { SaveBar } from '@/shared/ui/SaveBar'
import { Section } from '@/shared/ui/Section'

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
 * General (ADR 0024, ADR 0026): the data of this account in one form (two
 * groups), then — for whoever manages the business — the data that applies to
 * all your accounts, and the danger zone.
 */
export function KitchenGeneralPage() {
  const { can, canShared, organization } = useActiveKitchen()
  return (
    <SettingsPage title="General" description="Nombre, identificador y datos de esta cuenta." narrow>
      {can('settings.manage') && <AccountDetailsForm />}
      {organization && canShared('organization.manage') && <BusinessSection organizationId={organization.id} />}
      {canShared('accounts.manage') && (
        <Section title="Zona de peligro" description="Desactivar la cuenta detiene toda su operación; sus datos se conservan." card tone="danger">
          <AccountStatusCard />
        </Section>
      )}
    </SettingsPage>
  )
}

function BusinessSection({ organizationId }: { organizationId: string }) {
  const details = useOrganizationDetails(organizationId)
  return (
    <Section title="Tu negocio" description="Aplica a todas tus cuentas.">
      {details.isLoading ? (
        <LoadingState variant="block" />
      ) : details.isError || !details.data ? (
        <ErrorState error={details.error} onRetry={() => void details.refetch()} />
      ) : (
        <OrgGeneralForm key={details.data.id} org={details.data} />
      )}
    </Section>
  )
}

/**
 * Datos de la cuenta activa (settings.manage): nombre, identificador, icono,
 * zona horaria y datos fiscales y de contacto. Activar o desactivar la cuenta
 * es de quien administra las cuentas (lo exige la base).
 */
function AccountDetailsForm() {
  const { kitchen } = useActiveKitchen()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { show } = useToast()
  const { data: details, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['kitchen-details', kitchen.id],
    queryFn: () => getKitchenDetails(kitchen.id),
  })

  const [edited, setEdited] = useState<KitchenDetailsInput | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
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
      setSaveError(null)
      setSavedAt(Date.now())
      show('Datos de la cuenta guardados.')
      // El identificador es parte de la URL: si cambió, se sigue en la dirección nueva.
      if (input.slug !== kitchen.slug) navigate(kitchenPath(input.slug, '/settings/general'), { replace: true })
    },
    onError: (err) => {
      const raw = getErrorMessage(err, 'No se pudieron guardar los datos')
      const message = raw.includes('dk_kitchens_slug_key') ? 'Ese identificador ya lo usa otra cuenta.' : raw
      setSaveError(message)
      show(message, 'error')
    },
  })

  if (isLoading) return <LoadingState variant="block" />
  if (isError || !form) return <ErrorState error={error} onRetry={() => void refetch()} />

  const nameError = form.name.trim().length >= 2 ? null : 'Mínimo 2 caracteres'
  const slugProblem = slugError(form.slug)
  const phoneProblem = phoneError(form.phone ?? '', { original: details?.phone })
  const set = (patch: Partial<KitchenDetailsInput>) => setEdited({ ...form, ...patch })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form && !nameError && !slugProblem && !phoneProblem) save.mutate(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      <Section title="Esta cuenta" description="Cómo se ve en la app y en su dirección." card>
        <div className="space-y-5">
          <FormGrid>
            <FormField label="Nombre" required error={edited ? nameError : null}>
              {(a11y) => <Input {...a11y} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} />}
            </FormField>
            <FormField
              label="Identificador (URL)"
              required
              error={edited ? slugProblem : null}
              hint={
                <span className="inline-flex items-center gap-1">
                  <Link2 size={11} aria-hidden /> /k/{form.slug || '…'} — cambiarlo cambia los enlaces de esta cuenta.
                </span>
              }
            >
              {(a11y) => <Input {...a11y} value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} maxLength={60} />}
            </FormField>
            <FormField label="Zona horaria" hint="Define el “hoy” de la cuenta: menú del día, ventas de hoy y horario.">
              {(a11y) => (
                <Select {...a11y} value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
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
          <div className="space-y-3 border-t border-neutral-800/60 pt-5">
            <div className="flex items-center gap-3">
              <AccountIcon iconKey={form.iconKey} seed={kitchen.id} size="lg" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-200">Icono de la cuenta</p>
                <p className={typography.caption}>Representa al establecimiento en el selector de cuentas.</p>
              </div>
            </div>
            <AccountIconPicker value={resolveAccountIconKey(form.iconKey, kitchen.id)} onChange={(iconKey) => set({ iconKey })} />
          </div>
        </div>
      </Section>

      <Section title="Datos fiscales y de contacto" description="Opcionales: aparecen en documentos y soporte." card>
        <FormGrid>
          <FormField label="Razón social">{(a11y) => <Input {...a11y} value={form.legalName ?? ''} onChange={(e) => set({ legalName: e.target.value })} />}</FormField>
          <FormField label="NIT / identificación">{(a11y) => <Input {...a11y} value={form.taxId ?? ''} onChange={(e) => set({ taxId: e.target.value })} />}</FormField>
          <FormField label="Teléfono" error={phoneProblem}>
            {(a11y) => <PhoneInput {...a11y} value={form.phone ?? ''} onValueChange={(v) => set({ phone: v || null })} />}
          </FormField>
          <FormField label="Dirección">{(a11y) => <Input {...a11y} value={form.address ?? ''} onChange={(e) => set({ address: e.target.value })} />}</FormField>
        </FormGrid>
      </Section>

      <SaveBar
        dirty={edited !== null}
        saving={save.isPending}
        savedAt={savedAt}
        error={saveError}
        invalid={Boolean(nameError || slugProblem)}
        onDiscard={() => {
          setEdited(null)
          setSaveError(null)
        }}
      />
    </form>
  )
}
