import { AccountIcon } from '@/shared/avatars/Avatar'
import { formatMoney } from '@/shared/utils/format'
import { whatsappLink } from '@/shared/utils/whatsapp'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, ChefHat, Clock, MessageCircle, PackageCheck, Truck, XCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getOrderStatus } from '../api/publicMenu'
import { resolveTheme } from '../lib/themes'
import type { OrderStatus } from '../types'
import { ThemeRoot } from './ThemeRoot'

type Step = { key: string; label: string; icon: typeof Clock; done: (s: OrderStatus['status']) => boolean }

const ORDER: OrderStatus['status'][] = ['NUEVO', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'DESPACHADO', 'ENTREGADO']
const reached = (status: OrderStatus['status'], target: OrderStatus['status']) => ORDER.indexOf(status) >= ORDER.indexOf(target)

function stepsFor(fulfillment: OrderStatus['fulfillment']): Step[] {
  const steps: Step[] = [
    { key: 'received', label: 'Recibido', icon: Clock, done: () => true },
    { key: 'kitchen', label: 'En cocina', icon: ChefHat, done: (s) => reached(s, 'CONFIRMADO') },
    { key: 'ready', label: fulfillment === 'pickup' ? 'Listo para recoger' : 'Listo', icon: PackageCheck, done: (s) => reached(s, 'LISTO') },
  ]
  if (fulfillment !== 'pickup') steps.push({ key: 'onTheWay', label: 'En camino', icon: Truck, done: (s) => reached(s, 'DESPACHADO') })
  steps.push({ key: 'delivered', label: 'Entregado', icon: CheckCircle2, done: (s) => reached(s, 'ENTREGADO') })
  return steps
}

/**
 * Where the customer follows an order (ADR 0052, D8): the status, live, and
 * the summary. Only with its code. Drawn with the business's design (ADR 0053).
 */
export function OrderTrackingPage() {
  const { slug = '', token = '' } = useParams<{ slug: string; token: string }>()
  const order = useQuery({
    queryKey: ['public-order', token],
    queryFn: () => getOrderStatus(token),
    // Until it is delivered or cancelled, it is followed every 15 s.
    refetchInterval: (q) => (q.state.data && ['ENTREGADO', 'CANCELADO'].includes(q.state.data.status) ? false : 15_000),
    retry: 1,
  })
  const o = order.data
  const card = 'rounded-2xl bg-(--pm-surface) p-4 shadow-sm ring-1 ring-(--pm-border)'

  return (
    <ThemeRoot theme={resolveTheme(o?.business.theme)}>
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        {order.isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-(--pm-soft)" aria-label="Cargando el pedido" />
        ) : !o ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold">No encontramos este pedido</p>
            <p className="mt-1 text-sm text-(--pm-muted)">Revisa el enlace que recibiste.</p>
            <Link to={`/menu/${slug}`} className="mt-4 inline-block text-sm font-medium underline">
              Ver el menú
            </Link>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3">
              <AccountIcon iconKey={o.business.iconKey} seed={o.business.slug} size="md" className="rounded-xl" />
              <div>
                <p className="text-sm text-(--pm-muted)">{o.business.name}</p>
                <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--pm-font-heading)' }}>Pedido #{o.orderNumber}</h1>
              </div>
            </header>

            {o.status === 'CANCELADO' ? (
              <p className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">
                <XCircle size={18} aria-hidden /> Este pedido se canceló. Escríbele al negocio si tienes dudas.
              </p>
            ) : (
              <div className={card}>
                {o.status === 'NUEVO' && <p className="mb-3 text-sm text-(--pm-muted)">¡Recibido! El negocio lo está revisando y te confirma pronto.</p>}
                <ol className="space-y-3" aria-label="Estado del pedido">
                  {stepsFor(o.fulfillment).map((step) => {
                    const done = step.done(o.status)
                    const Icon = step.icon
                    return (
                      <li key={step.key} className={clsx('flex items-center gap-3', done ? 'text-(--pm-text)' : 'text-(--pm-muted)')}>
                        <span className={clsx('flex size-8 items-center justify-center rounded-full', done ? 'bg-(--pm-primary) text-(--pm-on-primary)' : 'bg-(--pm-soft)')}>
                          <Icon size={16} aria-hidden />
                        </span>
                        <span className={clsx('text-sm', done && 'font-semibold')}>{step.label}</span>
                      </li>
                    )
                  })}
                </ol>
                <p className="mt-3 text-xs text-(--pm-muted)">Se actualiza solo.</p>
              </div>
            )}

            <div className={card}>
              <ul className="space-y-1.5 text-sm">
                {o.items.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3">
                    <span>
                      {i.quantity} × {i.name}
                      {i.note && <span className="block text-xs text-(--pm-muted)">{i.note}</span>}
                    </span>
                    <span className="tabular-nums">{formatMoney(Number(i.lineTotal))}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-3 space-y-1 border-t border-(--pm-border) pt-3 text-sm">
                {Number(o.deliveryFee) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-(--pm-muted)">Domicilio</dt>
                    <dd className="tabular-nums">{formatMoney(Number(o.deliveryFee))}</dd>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoney(Number(o.total))}</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-(--pm-muted)">
                {o.fulfillment === 'pickup' ? 'Lo recoges en el local' : o.deliveryAddress ? `A domicilio: ${o.deliveryAddress}` : null}
                {o.paymentMethod && ` · Pagas con ${o.paymentMethod.toLowerCase()}`}
              </p>
              {o.paymentMethod === 'Transferencia' && o.business.transferInstructions && (
                <p className="mt-2 rounded-lg bg-(--pm-soft) px-3 py-2 text-sm">{o.business.transferInstructions}</p>
              )}
            </div>

            {o.business.whatsapp && (
              <a
                href={whatsappLink(o.business.whatsapp, `Hola, sobre mi pedido #${o.orderNumber} en ${o.business.name}`)}
                target="_blank"
                rel="noreferrer"
                style={{ borderRadius: 'var(--pm-btn-radius)' }}
                className="flex w-full items-center justify-center gap-2 bg-emerald-600 py-3.5 font-semibold text-white"
              >
                <MessageCircle size={18} aria-hidden /> Escribirle al negocio
              </a>
            )}
            <p className="text-center text-sm">
              <Link to={`/menu/${slug}`} className="font-medium underline">
                Volver al menú
              </Link>
            </p>
          </>
        )}
      </div>
    </ThemeRoot>
  )
}
