import { Badge } from '@/shared/ui/Badge'
import { Card } from '@/shared/ui/Card'
import { typography } from '@/shared/ui/typography'
import { formatDate } from '@/shared/utils/format'
import { formatPhone, phoneHref } from '@/shared/utils/phone'
import { CalendarDays, Mail, MessageCircle, Pencil, Phone, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CustomerDetail } from '../../types'

function Row({ icon: Icon, children }: { icon: typeof Phone; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-neutral-200">
      <Icon size={15} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

/** Contacto (ADR 0040): phone (call or WhatsApp), e-mail, since when, and the WhatsApp link. */
export function CustomerContact({ customer, onEdit }: { customer: CustomerDetail; onEdit?: () => void }) {
  const tel = phoneHref(customer.phone)
  const wa = tel ? `https://wa.me/${customer.phone!.replace(/\D/g, '')}` : null
  return (
    <Card
      title="Contacto"
      icon={UserRound}
      action={
        onEdit && (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
            <Pencil size={12} aria-hidden /> Editar
          </button>
        )
      }
    >
      <ul className="space-y-2.5">
        <Row icon={Phone}>
          {customer.phone ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {tel ? (
                <a href={tel} className="tabular-nums hover:underline">
                  {formatPhone(customer.phone)}
                </a>
              ) : (
                <span>{formatPhone(customer.phone)}</span>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline">
                  <MessageCircle size={12} aria-hidden /> WhatsApp
                </a>
              )}
            </span>
          ) : (
            <span className="text-neutral-500">Sin teléfono</span>
          )}
        </Row>
        <Row icon={Mail}>
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="hover:underline">
              {customer.email}
            </a>
          ) : (
            <span className="text-neutral-500">Sin correo</span>
          )}
        </Row>
        <Row icon={CalendarDays}>Cliente desde el {formatDate(customer.createdAt)}</Row>
      </ul>
      {customer.hasWhatsapp && (
        <p className={`mt-3 ${typography.caption}`}>
          <Badge size="sm" tone="success" icon={MessageCircle}>
            WhatsApp vinculado
          </Badge>{' '}
          Sus pedidos pueden llegar por WhatsApp.
        </p>
      )}
    </Card>
  )
}
