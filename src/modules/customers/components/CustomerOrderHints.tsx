import { Badge } from '@/shared/ui/Badge'
import { typography } from '@/shared/ui/typography'
import { Ban, Heart, Lightbulb, Salad } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCustomerDetail } from '../hooks/useCustomers'
import { useCustomerProfile } from '../hooks/useCustomerProfile'
import { preferencesOf } from '../lib/profile'
import { CompanyIcon, PreferredBadge } from './CustomerIdentity'

function Line({ icon: Icon, label, tone, children }: { icon: typeof Ban; label: string; tone: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className={`mt-1 shrink-0 ${tone}`} aria-hidden />
      <div className="min-w-0">
        <p className={typography.overline}>{label}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
  )
}

/**
 * ADR 0044: while taking an order, what the person serving must know about
 * this customer — first what NOT to serve (dislikes and diet), then the
 * favourite dishes and the active recommendations; and whether the customer
 * is preferred or a company. Read only: it is edited in the customer's sheet.
 * Nothing to say (or no permission to read it): nothing is shown.
 */
export function CustomerOrderHints({ customerId }: { customerId: string }) {
  const detail = useCustomerDetail(customerId)
  const profile = useCustomerProfile(customerId)
  const customer = detail.data
  const preferences = profile.data?.preferences.filter((p) => p.active) ?? []
  const dislikes = preferencesOf(preferences, 'disliked_ingredient')
  const dietary = preferencesOf(preferences, 'dietary')
  const favorites = preferencesOf(preferences, 'favorite_dish')
  const recommendations = profile.data?.recommendations.filter((r) => r.status === 'active') ?? []
  const marks = customer && (customer.preferred || customer.type === 'company')
  if (!marks && !dislikes.length && !dietary.length && !favorites.length && !recommendations.length) return null

  return (
    <section aria-label="Lo que debes saber de este cliente" className="space-y-3 rounded-xl border border-neutral-800/60 bg-neutral-900/50 p-3">
      {marks && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-200">
          {customer.type === 'company' && (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-300">
              <CompanyIcon /> Empresa{customer.contactName ? ` · contacto: ${customer.contactName}` : ''}
            </span>
          )}
          {customer.preferred && <PreferredBadge />}
          {customer.preferred && customer.preferredNote && <span className="text-xs text-amber-200/80">{customer.preferredNote}</span>}
        </p>
      )}
      {(dislikes.length > 0 || dietary.length > 0) && (
        <Line icon={Ban} label="Ojo: no le gusta / su dieta" tone="text-red-400">
          {dislikes.map((p) => (
            <Badge key={p.id} size="sm" tone="danger">
              Sin {p.name}
            </Badge>
          ))}
          {dietary.map((p) => (
            <Badge key={p.id} size="sm" tone="info" icon={Salad}>
              {p.name}
            </Badge>
          ))}
        </Line>
      )}
      {favorites.length > 0 && (
        <Line icon={Heart} label="Sus favoritos" tone="text-brasa-400">
          {favorites.map((p) => (
            <Badge key={p.id} size="sm" tone="brand">
              {p.name}
            </Badge>
          ))}
        </Line>
      )}
      {recommendations.length > 0 && (
        <Line icon={Lightbulb} label="Recomiéndale" tone="text-amber-300">
          {recommendations.slice(0, 3).map((r) => (
            <span key={r.id} className="text-xs text-neutral-300" title={r.reason ?? undefined}>
              {r.title}
              {r.productName && r.productName !== r.title ? ` (${r.productName})` : ''}
            </span>
          ))}
        </Line>
      )}
    </section>
  )
}
