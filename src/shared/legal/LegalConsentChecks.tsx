import { useId, type ReactNode } from 'react'
import type { LegalChecks } from './checks'
import { legalHref } from './documents'

function DocLink({ slug, children }: { slug: string; children: string }) {
  // A new tab: what was already typed in the form stays.
  return (
    <a href={legalHref(slug)} target="_blank" rel="noopener noreferrer" className="font-medium text-brasa-400 underline underline-offset-2 hover:text-brasa-300">
      {children}
    </a>
  )
}

/**
 * Two separate, required boxes, never pre-ticked (ADR 0071; Ley 1581 art. 9, Ley 1480 art. 50):
 * the contract and the data authorization are different acts. Neither includes cookies or marketing.
 */
export function LegalConsentChecks({ value, onChange, showErrors = false }: { value: LegalChecks; onChange: (next: LegalChecks) => void; showErrors?: boolean }) {
  const id = useId()
  const row = (key: keyof LegalChecks, label: ReactNode) => {
    const missing = showErrors && !value[key]
    return (
      <div>
        <label htmlFor={`${id}-${key}`} className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-neutral-300">
          <input
            id={`${id}-${key}`}
            type="checkbox"
            required
            aria-invalid={missing || undefined}
            aria-describedby={missing ? `${id}-${key}-error` : undefined}
            checked={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
          />
          <span>{label}</span>
        </label>
        {missing && (
          <p id={`${id}-${key}-error`} className="mt-1 ml-6.5 text-xs text-red-400">
            Es obligatorio para crear tu cuenta.
          </p>
        )}
      </div>
    )
  }
  return (
    <fieldset className="space-y-2.5">
      <legend className="sr-only">Aceptación de documentos</legend>
      {row(
        'terms',
        <>
          Acepto los <DocLink slug="terminos">Términos y Condiciones</DocLink> y declaro que soy mayor de edad.
        </>,
      )}
      {row(
        'privacy',
        <>
          He leído y acepto la <DocLink slug="privacidad">Política de Tratamiento de Datos Personales</DocLink>.
        </>,
      )}
    </fieldset>
  )
}
