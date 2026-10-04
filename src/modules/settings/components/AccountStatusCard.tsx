import { setAccountsActive } from '@/modules/organization/api/organization'
import { MY_KITCHENS_KEY, useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Power } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Deactivate this account (ADR 0012 §4, now inside the account, ADR 0024):
 * nobody can operate it until it is activated again from "Tus cuentas". Its
 * data is kept. Only with accounts.manage (the database checks it again).
 */
export function AccountStatusCard() {
  const { kitchen } = useActiveKitchen()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { show } = useToast()
  const [confirm, setConfirm] = useState(false)
  const deactivate = useMutation({
    mutationFn: () => setAccountsActive([kitchen.id], false),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MY_KITCHENS_KEY })
      show('Cuenta desactivada.')
      navigate('/cuentas')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo desactivar la cuenta'), 'error'),
  })

  return (
    <Card title="Estado de la cuenta" description="Desactivarla detiene toda su operación; sus datos se conservan" icon={Power}>
      <div className="flex justify-end">
        <Button variant="danger" icon={Power} onClick={() => setConfirm(true)}>
          Desactivar cuenta
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => deactivate.mutate()}
        pending={deactivate.isPending}
        danger
        title="Desactivar cuenta"
        confirmLabel="Sí, desactivar"
        description={<p>Nadie podrá operar {kitchen.name} (pedidos, inventario, todo) hasta que la actives de nuevo desde «Tus cuentas». Sus datos se conservan.</p>}
      />
    </Card>
  )
}
