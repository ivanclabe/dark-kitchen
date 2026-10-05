import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { Copy } from 'lucide-react'
import { SettingsPage } from '../ui/SettingsPage'
import { Section } from '@/shared/ui/Section'

/**
 * Integrations of the active account (ADR 0012, ADR 0024): an external system
 * (e.g. orders by WhatsApp with n8n) points to THIS account with its ID. Only
 * this account's ID is shown.
 */
export function IntegrationsSettingsPage() {
  const { kitchen } = useActiveKitchen()
  const { show } = useToast()
  return (
    <SettingsPage title="Integraciones" description="Conecta sistemas externos a esta cuenta.">
      <Section title="ID de la cuenta" description="Por ejemplo, para pedidos por WhatsApp con n8n: la integración lo envía en cada petición y con él solo ve esta cuenta." card>
        <FormField
          label="ID de la cuenta"
          hint={
            <>
              Va en el encabezado <code className="text-neutral-300">x-dk-kitchen-id</code>. Sin él la integración no ve ni registra nada.
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
      </Section>
      <p className={typography.caption}>Las fallas de las integraciones todavía no se registran; la actividad por canal sí (Actividad → Operación).</p>
    </SettingsPage>
  )
}
