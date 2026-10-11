import { KitchenLink } from '@/shared/kitchen/KitchenLink'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormField, Textarea } from '@/shared/ui/FormField'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import clsx from 'clsx'
import { AlertTriangle, Bot, Hand, ShieldCheck, Workflow } from 'lucide-react'
import { useState } from 'react'
import { useWaActions } from '../hooks'
import type { OrderingMode, WaSettings } from '../types'

const MODES: { value: OrderingMode; title: string; text: string; icon: typeof Bot }[] = [
  { value: 'off', title: 'Las atiende tu equipo', text: 'Los mensajes llegan a la bandeja (Mensajes) y tu equipo responde.', icon: Hand },
  {
    value: 'ai',
    title: 'Asistente de Quanela',
    text: 'Entiende el pedido, lo busca en el menú de hoy, muestra el total real y lo crea cuando el cliente confirma. Si duda o el cliente lo pide, pasa a tu equipo.',
    icon: Bot,
  },
  { value: 'n8n', title: 'Tu flujo de n8n', text: 'Los mensajes van a tu n8n; tu flujo responde y crea los pedidos con las reglas de Quanela.', icon: Workflow },
]

/**
 * Pedidos por WhatsApp (ADR 0055, fase B): who answers the customers — the team,
 * Quanela's assistant (interprets, never invents) or the account's n8n.
 */
export function OrderingTab({ settings }: { settings: WaSettings }) {
  const { show } = useToast()
  const { save } = useWaActions()
  const account = settings.account
  const [greeting, setGreeting] = useState(account?.orderingGreeting ?? '')
  const canManage = settings.canManage

  if (!account) return <p className="rounded-xl border border-neutral-800 px-4 py-3 text-sm text-neutral-400">Conecta tu número en la pestaña Conexión para recibir pedidos por WhatsApp.</p>

  async function setMode(mode: OrderingMode) {
    try {
      await save.mutateAsync({ orderingMode: mode })
      show(mode === 'ai' ? 'El asistente atenderá los mensajes nuevos.' : mode === 'n8n' ? 'Los mensajes irán a tu n8n.' : 'Tu equipo atenderá los mensajes.')
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar'), 'error')
    }
  }

  const warnings: string[] = []
  if (!settings.orderingConfigured) warnings.push('Configura cómo recibes pedidos (domicilio, recoger, pago) en Menú público → Resumen.')
  if (account.orderingMode === 'ai' && !settings.orderingFeatureEnabled) warnings.push('El asistente no está activo en tu plan u organización: los mensajes llegarán a la bandeja.')
  if (account.orderingMode === 'n8n' && !settings.endpoint) warnings.push('Falta conectar tu n8n (pestaña n8n).')

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        {warnings.length > 0 && (
          <ul className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3" role="radiogroup" aria-label="Quién atiende los mensajes">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={account.orderingMode === m.value}
              disabled={!canManage || save.isPending}
              onClick={() => void setMode(m.value)}
              className={clsx(
                'flex gap-3 rounded-xl border p-4 text-left transition-colors',
                account.orderingMode === m.value ? 'border-brasa-500/70 bg-brasa-500/5' : 'border-neutral-800 hover:border-neutral-600',
              )}
            >
              <m.icon size={18} className="mt-0.5 shrink-0 text-neutral-400" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-neutral-100">{m.title}</span>
                <span className="block text-xs text-neutral-400">{m.text}</span>
              </span>
            </button>
          ))}
        </div>
        {account.orderingMode === 'ai' && (
          <Card title="Saludo del asistente" description="Opcional. Lo primero que lee el cliente.">
            <div className="space-y-2">
              <FormField label="Saludo">
                {(a11y) => <Textarea {...a11y} rows={2} maxLength={300} value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="¡Hola! Bienvenido a Sopas Doña Ana. 🍲" disabled={!canManage} />}
              </FormField>
              {canManage && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={save.isPending}
                    onClick={() => void save.mutateAsync({ orderingGreeting: greeting }).then(() => show('Saludo guardado.'), (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'))}
                  >
                    Guardar saludo
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
      <Card title="Cómo cuida tus pedidos" icon={ShieldCheck}>
        <ul className="list-disc space-y-1.5 pl-4 text-sm text-neutral-300">
          <li>Solo ofrece los platos del menú de hoy, con su disponibilidad, horario y límite.</li>
          <li>Los precios, el domicilio, el mínimo y el total los calcula Quanela; la IA nunca los ve ni los inventa.</li>
          <li>Antes de crear el pedido muestra el resumen con el total real y espera un «sí».</li>
          <li>El pedido entra como cualquier otro (canal WhatsApp), con las reglas de tu menú público y su confirmación automática.</li>
          <li>Si no entiende dos veces, si el cliente pide una persona o si hay una pregunta, la conversación pasa a la bandeja.</li>
          <li>«BAJA» detiene los avisos al instante.</li>
        </ul>
        <p className="mt-3 text-xs text-neutral-500">
          Las reglas de pedido (domicilio, recoger, pago, mínimo) son las de{' '}
          <KitchenLink to="/public-menu" className="text-brasa-400 hover:underline">
            Menú público
          </KitchenLink>
          . El asistente tiene su propio cupo diario de IA.
        </p>
      </Card>
    </div>
  )
}
