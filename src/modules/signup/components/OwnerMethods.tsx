import { COUNTRIES } from '@/modules/organization/lib/business'
import { Button } from '@/shared/ui/Button'
import { FormField, Input, Select } from '@/shared/ui/FormField'
import { typography } from '@/shared/ui/typography'
import { ArrowLeft, Mail, MessageSquareText, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { TURNSTILE_SITE_KEY } from '../api'
import { continueWithProvider, DIAL_CODES, ownerAuthErrorMessage, requestPhoneCode, toE164, verifyPhoneCode, type OwnerMethod } from '../ownerAuth'
import { markOwnerSignIn } from '../ownerSession'
import { TurnstileWidget } from './TurnstileWidget'

/** Wait between SMS codes. */
const RESEND_WAIT_S = 60

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <defs>
        <linearGradient id="ig-gradient" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.35" stopColor="#FA7E1E" />
          <stop offset="0.6" stopColor="#D62976" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-gradient)" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="17.3" cy="6.7" r="1.2" fill="#fff" />
    </svg>
  )
}

const methodButtonClass =
  'flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'

/**
 * "Continuar con Google / Instagram / teléfono / email" (ADR 0025): only the
 * configured methods. Google and Instagram leave for the provider and come
 * back to `returnPath`; phone opens `onPhone`; email, `onEmail`.
 */
export function OwnerMethodButtons({
  methods,
  returnPath,
  onPhone,
  onEmail,
  onError,
}: {
  methods: OwnerMethod[]
  returnPath?: string
  onPhone: () => void
  onEmail?: () => void
  onError: (message: string) => void
}) {
  const [leaving, setLeaving] = useState<OwnerMethod | null>(null)

  async function oauth(method: 'google' | 'instagram') {
    setLeaving(method)
    markOwnerSignIn()
    try {
      await continueWithProvider(method, returnPath)
    } catch (err) {
      setLeaving(null)
      onError(ownerAuthErrorMessage(err))
    }
  }

  const button = (key: string, icon: ReactNode, label: string, onClick: () => void, hint?: string) => (
    <div key={key}>
      <button type="button" className={methodButtonClass} onClick={onClick} disabled={leaving !== null}>
        {icon}
        {leaving === key ? 'Abriendo…' : label}
      </button>
      {hint && <p className="mt-1 text-center text-[11px] text-neutral-500">{hint}</p>}
    </div>
  )

  return (
    <div className="space-y-2.5">
      {methods.includes('google') && button('google', <GoogleIcon />, 'Continuar con Google', () => void oauth('google'))}
      {methods.includes('instagram') &&
        button('instagram', <InstagramIcon />, 'Continuar con Instagram', () => void oauth('instagram'), 'Necesitas una cuenta profesional de Instagram (beta).')}
      {methods.includes('phone') && button('phone', <Smartphone size={18} className="text-neutral-300" aria-hidden />, 'Continuar con teléfono', onPhone)}
      {onEmail && button('email', <Mail size={18} className="text-neutral-300" aria-hidden />, 'Continuar con email', onEmail)}
    </div>
  )
}

/**
 * Phone + SMS code (ADR 0025): number → validate → code by SMS (Supabase Auth)
 * → verify → signed in. The code is never stored by the app. `create`: true
 * while signing up; false on the login (it never creates users).
 */
export function PhoneSignIn({ create, onBack, onSignedIn }: { create: boolean; onBack: () => void; onSignedIn: () => void }) {
  const [country, setCountry] = useState('CO')
  const [number, setNumber] = useState('')
  const [phone, setPhone] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const onCaptcha = useCallback((token: string | null) => setCaptchaToken(token), [])
  const e164 = toE164(country, number)

  useEffect(() => {
    if (wait <= 0) return
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(id)
  }, [wait])

  async function send(target: string) {
    setBusy(true)
    setError(null)
    try {
      await requestPhoneCode(target, { create, captchaToken: captchaToken ?? undefined })
      setPhone(target)
      setCode('')
      setWait(RESEND_WAIT_S)
    } catch (err) {
      setError(ownerAuthErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (!phone || code.trim().length < 6) return
    setBusy(true)
    setError(null)
    try {
      markOwnerSignIn()
      await verifyPhoneCode(phone, code)
      onSignedIn()
    } catch (err) {
      setError(ownerAuthErrorMessage(err))
      setBusy(false)
    }
  }

  if (phone) {
    return (
      <form onSubmit={(e) => void verify(e)} className="space-y-4" noValidate>
        <p className={typography.small}>
          Te enviamos un código por SMS a <span className="font-mono text-neutral-100">{phone}</span>.
        </p>
        <FormField label="Código" required error={error}>
          {(a11y) => (
            <Input
              {...a11y}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="font-mono tracking-[0.3em]"
              autoFocus
            />
          )}
        </FormField>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={code.trim().length < 6}>
          Verificar
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" className="text-neutral-400 hover:text-neutral-200" onClick={() => setPhone(null)} disabled={busy}>
            Cambiar el número
          </button>
          <button type="button" className="text-brasa-400 hover:underline disabled:text-neutral-600 disabled:no-underline" onClick={() => void send(phone)} disabled={busy || wait > 0}>
            {wait > 0 ? `Reenviar en ${wait} s` : 'Reenviar el código'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (e164) void send(e164)
      }}
      className="space-y-4"
      noValidate
    >
      <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-2">
        <FormField label="País">
          {(a11y) => (
            <Select {...a11y} value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  +{DIAL_CODES[c.value]} {c.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Número de celular" required error={error ?? (number && !e164 ? 'Número no válido' : null)}>
          {(a11y) => <Input {...a11y} type="tel" inputMode="tel" autoComplete="tel-national" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="300 123 4567" autoFocus />}
        </FormField>
      </div>
      {TURNSTILE_SITE_KEY && <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={onCaptcha} />}
      <Button type="submit" variant="primary" size="lg" icon={MessageSquareText} className="w-full" loading={busy} disabled={!e164 || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}>
        Enviarme el código
      </Button>
      <button type="button" onClick={onBack} className="flex w-full items-center justify-center gap-1 text-sm text-neutral-400 hover:text-neutral-200">
        <ArrowLeft size={14} aria-hidden /> Otros métodos
      </button>
    </form>
  )
}
