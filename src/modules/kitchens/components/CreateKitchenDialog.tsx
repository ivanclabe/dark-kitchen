import { AccountIcon } from '@/shared/avatars/Avatar'
import { suggestAccountIcon, type AccountIconKey } from '@/shared/avatars/catalog'
import { AccountIconPicker } from '@/shared/avatars/GalleryPicker'
import { MY_KITCHENS_KEY } from '@/shared/kitchen/activeKitchenContext'
import { createKitchen } from '@/shared/kitchen/kitchensApi'
import { slugError, slugify } from '@/shared/kitchen/slug'
import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

/**
 * Crear una Cuenta en una organización (SUPER_ADMIN: dk_create_kitchen exige
 * accounts.create). Nace con su icono, su configuración inicial (SLA,
 * numeración desde 1000; las funciones con los valores del catálogo) y, si
 * la crea el SUPER_ADMIN, con él como SUPER_ADMIN + ADMIN (ADR 0009, 3.3).
 * Al crearla se entra a ella (lo decide quien abre el diálogo).
 */
export function CreateKitchenDialog({
  organizationId,
  organizationName,
  onClose,
  onCreated,
}: {
  organizationId?: string
  organizationName?: string
  onClose: () => void
  onCreated: (slug: string) => void
}) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [icon, setIcon] = useState<AccountIconKey | null>(null)
  const [pickingIcon, setPickingIcon] = useState(false)
  const effectiveIcon = icon ?? suggestAccountIcon(name)
  const effectiveSlug = slugTouched ? slug : slugify(name)
  const nameError = name.trim().length >= 2 ? null : 'Mínimo 2 caracteres'
  const error = nameError ?? slugError(effectiveSlug)

  const create = useMutation({
    mutationFn: () => createKitchen(name.trim(), effectiveSlug, organizationId, effectiveIcon),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      show(`Cuenta "${name.trim()}" creada.`)
      onCreated(effectiveSlug)
    },
    onError: (err) => {
      const message = getErrorMessage(err, 'No se pudo crear la cuenta')
      show(message.includes('dk_kitchens_slug_key') ? 'Ya existe una cuenta con ese identificador.' : message, 'error')
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!error) create.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva cuenta"
      description={`${organizationName ? `En ${organizationName}. ` : ''}Cada cuenta es un establecimiento independiente: sus pedidos, clientes, menú e inventario no se mezclan con los de otras.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="create-kitchen-form" variant="primary" loading={create.isPending} disabled={Boolean(error)}>
            Crear cuenta
          </Button>
        </>
      }
    >
      <form id="create-kitchen-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <AccountIcon iconKey={effectiveIcon} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-200">Icono de la cuenta</p>
              <button type="button" onClick={() => setPickingIcon((v) => !v)} className="text-xs text-brasa-400 hover:underline" aria-expanded={pickingIcon}>
                {pickingIcon ? 'Listo' : 'Cambiar icono'}
              </button>
            </div>
          </div>
          {pickingIcon && <AccountIconPicker compact value={effectiveIcon} onChange={setIcon} />}
        </div>
        <FormField label="Nombre" required>
          {(a11y) => <Input {...a11y} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Hamburguesería Norte" maxLength={80} />}
        </FormField>
        <FormField
          label="Identificador (URL)"
          required
          hint={`La cuenta quedará en /k/${effectiveSlug || '…'}`}
          error={name || slugTouched ? slugError(effectiveSlug) : null}
        >
          {(a11y) => (
            <Input
              {...a11y}
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value.toLowerCase())
              }}
              placeholder="hamburgueseria-norte"
              maxLength={60}
            />
          )}
        </FormField>
      </form>
    </Modal>
  )
}
