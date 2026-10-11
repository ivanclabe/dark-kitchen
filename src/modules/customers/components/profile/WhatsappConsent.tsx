import { supabase } from '@/shared/lib/supabase'
import { useActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDate } from '@/shared/utils/format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface Consent {
  whatsapp_opt_in: boolean
  whatsapp_opt_in_at: string | null
  whatsapp_opt_in_source: 'web' | 'whatsapp' | 'staff' | null
  whatsapp_opt_out_at: string | null
}

const SOURCE = { web: 'en el menú web', whatsapp: 'escribiendo por WhatsApp', staff: 'según el equipo' } as const

/**
 * Avisos por WhatsApp (ADR 0055): whether the customer accepted getting the
 * status of their orders by WhatsApp. The staff can mark it when the customer
 * asks for it, or turn it off; «BAJA» on WhatsApp turns it off too.
 */
export function WhatsappConsent({ customerId }: { customerId: string }) {
  const { can } = useActiveKitchen()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const key = ['customer-wa-consent', customerId]
  const consent = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dk_customers')
        .select('whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_opt_in_source, whatsapp_opt_out_at')
        .eq('id', customerId)
        .maybeSingle()
      if (error) throw error
      return data as Consent | null
    },
  })
  const save = useMutation({
    mutationFn: async (optIn: boolean) => {
      const { error } = await supabase.rpc('dk_customer_set_whatsapp_opt_in', { p_customer_id: customerId, p_opt_in: optIn })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  })
  const c = consent.data
  if (!c) return null
  const on = c.whatsapp_opt_in && !c.whatsapp_opt_out_at
  return (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-neutral-800 px-3 py-2.5">
      <div className="min-w-0 text-sm">
        <p className="text-neutral-200">Avisos de pedidos por WhatsApp</p>
        <p className="text-xs text-neutral-500">
          {on
            ? `Aceptó${c.whatsapp_opt_in_source ? ` ${SOURCE[c.whatsapp_opt_in_source]}` : ''}${c.whatsapp_opt_in_at ? ` el ${formatDate(c.whatsapp_opt_in_at)}` : ''}.`
            : c.whatsapp_opt_out_at
              ? `Pidió no recibir mensajes el ${formatDate(c.whatsapp_opt_out_at)}.`
              : 'No ha aceptado. Actívalo solo si el cliente te lo pidió.'}
        </p>
      </div>
      <Switch
        checked={on}
        disabled={!can('customers.edit') || save.isPending}
        label="Avisos de pedidos por WhatsApp"
        onChange={(v) => void save.mutateAsync(v).then(() => show(v ? 'El cliente recibirá avisos de sus pedidos.' : 'El cliente ya no recibirá avisos.'), (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'))}
      />
    </div>
  )
}
