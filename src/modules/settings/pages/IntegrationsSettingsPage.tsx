import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { Copy, Plug } from 'lucide-react'

/**
 * Integrations of the active account (ADR 0012, ADR 0024): an external system
 * (e.g. orders by WhatsApp with n8n) points to THIS account with its ID. Only
 * this account's ID is shown.
 */
export function IntegrationsSettingsPage() {
  const { kitchen } = useActiveKitchen()
  const { show } = useToast()
  return (
    <div className="max-w-3xl space-y-5">
      <Card title="Conectar un sistema externo" description="Por ejemplo, pedidos por WhatsApp con n8n" icon={Plug}>
        <FormField
          label="ID de la cuenta"
          hint={
            <>
              Cada integración envía este valor en el encabezado <code className="text-neutral-300">x-dk-kitchen-id</code>. Sin él no ve ni registra nada, y con él
              solo ve esta cuenta.
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
      <p className={typography.caption}>Las fallas de las integraciones todavía no se registran; la actividad por canal sí (Configuración → Actividad).</p>
    </div>
  )
}
