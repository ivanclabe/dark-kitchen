import { AccountIcon } from '@/shared/avatars/Avatar'
import { resolveAccountIconKey, type AccountIconKey } from '@/shared/avatars/catalog'
import { AccountIconPicker } from '@/shared/avatars/GalleryPicker'
import { MY_KITCHENS_KEY } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Drawer } from '@/shared/ui/Drawer'
import { FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { updateAccount, type OrgAccount } from '../api/organization'
import { orgKey } from '../hooks/useOrganization'

/**
 * Editar una Cuenta desde la organización (ADR 0009): nombre e icono, con la
 * misma galería de establecimientos que en la creación. El resto de sus datos
 * se edita dentro de la Cuenta (Configuración → General).
 */
export function AccountEditDrawer({ account, organizationId, onClose }: { account: OrgAccount; organizationId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const [name, setName] = useState(account.name)
  const [icon, setIcon] = useState<AccountIconKey>(resolveAccountIconKey(account.iconKey, account.id))
  const nameError = name.trim().length >= 2 ? null : 'Mínimo 2 caracteres'
  const changed = name.trim() !== account.name || icon !== account.iconKey

  const save = useMutation({
    mutationFn: () => updateAccount(account.id, { name, iconKey: icon }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(organizationId) })
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      show('Cuenta actualizada.')
      onClose()
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar la cuenta'), 'error'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nameError && changed) save.mutate()
  }

  return (
    <Drawer open onClose={onClose} title="Editar cuenta" subtitle={`/k/${account.slug}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-center gap-3">
          <AccountIcon iconKey={icon} size="xl" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-neutral-100">{name.trim() || account.name}</p>
            <p className={typography.caption}>Así se verá en el selector de cuentas.</p>
          </div>
        </div>
        <FormField label="Nombre" required error={nameError}>
          {(a11y) => <Input {...a11y} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </FormField>
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-200">Icono</p>
          <AccountIconPicker compact value={icon} onChange={setIcon} />
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-800/60 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={Boolean(nameError) || !changed}>
            Guardar
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
