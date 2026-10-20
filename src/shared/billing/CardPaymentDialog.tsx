import { Button } from '@/shared/ui/Button'
import { FormField, Input } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { typography } from '@/shared/ui/typography'
import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { BillingPeriod } from '@/shared/plans/plans'
import { recordLegalAcceptance } from '@/shared/legal/api'
import { documentRef, legalHref } from '@/shared/legal/documents'
import {
  billingMessage,
  fetchWompiConfig,
  formatCardNumber,
  isValidCardNumber,
  isValidExpiry,
  payWithCard,
  tokenizeCard,
  type CardPaymentResult,
} from './billing'

/**
 * Pay with a card and keep it for the renewals (ADR 0066). The card is tokenized by
 * Wompi from this browser; Quanela only keeps Wompi's token and «Visa •••• 4242».
 * The two acceptances are the ones Colombian law asks for, with Wompi's own texts. ADR 0071: a third, separate
 * one authorizes the automatic renewal (D1074 2.2.2.37.9 par. 2), recorded as evidence before any charge.
 */
export function CardPaymentDialog({
  open,
  onClose,
  organizationId,
  planKey,
  billingPeriod,
  defaultEmail,
  title = 'Pagar con tarjeta',
  onDone,
}: {
  open: boolean
  onClose: () => void
  organizationId: string
  planKey?: string
  billingPeriod?: BillingPeriod
  defaultEmail?: string | null
  title?: string
  onDone: (result: CardPaymentResult) => void
}) {
  const config = useQuery({ queryKey: ['wompi-config', organizationId], queryFn: () => fetchWompiConfig(organizationId), enabled: open, staleTime: 10 * 60_000 })
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [holder, setHolder] = useState('')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [acceptData, setAcceptData] = useState(false)
  const [acceptRenewal, setAcceptRenewal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)

  const [expMonth = '', expYear = ''] = expiry.split('/')
  const errors = {
    number: isValidCardNumber(number) ? null : 'Revisa el número de la tarjeta',
    expiry: isValidExpiry(expMonth, expYear) ? null : 'Escribe la fecha como MM/AA',
    cvc: /^\d{3,4}$/.test(cvc) ? null : 'Son 3 o 4 dígitos',
    holder: holder.trim().length >= 3 ? null : 'Como aparece en la tarjeta',
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'Escribe un correo válido',
  }
  const valid = Object.values(errors).every((e) => e === null) && acceptPrivacy && acceptData && acceptRenewal

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid || !config.data) return
    setBusy(true)
    setError(null)
    try {
      await recordLegalAcceptance({
        documents: [documentRef('suscripciones')],
        context: 'billing_renewal',
        organizationId,
        details: {
          plan: planKey ?? null,
          billingPeriod: billingPeriod ?? null,
          wompiTermsAccepted: acceptPrivacy,
          wompiPersonalDataAccepted: acceptData,
          wompiTermsUrl: config.data.acceptance.privacy.permalink ?? null,
          wompiPersonalDataUrl: config.data.acceptance.personalData.permalink ?? null,
        },
      })
      const cardToken = await tokenizeCard(config.data, { number, expMonth, expYear, cvc, holder })
      const result = await payWithCard({
        organizationId,
        planKey,
        billingPeriod,
        cardToken,
        acceptanceToken: config.data.acceptance.privacy.token,
        personalAuthToken: config.data.acceptance.personalData.token,
        email,
      })
      if (result.charged && result.status === 'DECLINED') {
        setError(result.message ? `La tarjeta fue rechazada: ${result.message}` : 'La tarjeta fue rechazada. Prueba con otra o paga con Wompi.')
        return
      }
      onDone(result)
    } catch (err) {
      setError(billingMessage(err, 'No pudimos procesar la tarjeta').message)
    } finally {
      setBusy(false)
    }
  }

  const show = (key: keyof typeof errors) => (touched ? errors[key] : null)

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description="Queda guardada para renovar sin que tengas que hacer nada. Puedes quitarla cuando quieras."
    >
      {config.isError ? (
        <p role="alert" className="text-sm text-red-400">
          {billingMessage(config.error, 'Los pagos con tarjeta no están disponibles ahora.').message}
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <FormField label="Número de la tarjeta" error={show('number')} required>
            {(a) => (
              <Input {...a} inputMode="numeric" autoComplete="cc-number" value={number} onChange={(e) => setNumber(formatCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" />
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Vence" error={show('expiry')} required>
              {(a) => (
                <Input
                  {...a}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  value={expiry}
                  placeholder="MM/AA"
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
                  }}
                />
              )}
            </FormField>
            <FormField label="Código (CVC)" error={show('cvc')} required>
              {(a) => <Input {...a} inputMode="numeric" autoComplete="cc-csc" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" />}
            </FormField>
          </div>
          <FormField label="Nombre en la tarjeta" error={show('holder')} required>
            {(a) => <Input {...a} autoComplete="cc-name" value={holder} onChange={(e) => setHolder(e.target.value)} />}
          </FormField>
          <FormField label="Correo para los comprobantes" error={show('email')} required>
            {(a) => <Input {...a} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>

          <div className="space-y-2 text-sm text-neutral-300">
            <label className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--color-primary)]" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} />
              <span>
                Acepto los{' '}
                <a href={config.data?.acceptance.privacy.permalink} target="_blank" rel="noreferrer" className="text-brasa-400 underline-offset-4 hover:underline">
                  términos y la política de privacidad de Wompi
                </a>
                .
              </span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--color-primary)]" checked={acceptData} onChange={(e) => setAcceptData(e.target.checked)} />
              <span>
                Autorizo el{' '}
                <a href={config.data?.acceptance.personalData.permalink} target="_blank" rel="noreferrer" className="text-brasa-400 underline-offset-4 hover:underline">
                  tratamiento de mis datos personales
                </a>{' '}
                para los cobros de la suscripción.
              </span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--color-primary)]" checked={acceptRenewal} onChange={(e) => setAcceptRenewal(e.target.checked)} />
              <span>
                Autorizo la <strong className="font-medium text-neutral-100">renovación automática</strong>: Quanela cobrará a esta tarjeta el valor del plan al
                empezar cada periodo, hasta que cancele o quite la tarjeta. Leí{' '}
                <a href={legalHref('suscripciones')} target="_blank" rel="noopener noreferrer" className="text-brasa-400 underline-offset-4 hover:underline">
                  cómo funcionan las suscripciones y los cobros
                </a>
                .
              </span>
            </label>
            {touched && !(acceptPrivacy && acceptData && acceptRenewal) && <p className="text-xs text-red-400">Para guardar la tarjeta hay que aceptar las tres.</p>}
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <p className={`flex items-center gap-1.5 ${typography.caption}`}>
            <Lock size={12} aria-hidden /> La tarjeta va directo a Wompi (Bancolombia). Quanela no guarda su número.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" loading={busy} disabled={config.isLoading}>
              Pagar y guardar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
