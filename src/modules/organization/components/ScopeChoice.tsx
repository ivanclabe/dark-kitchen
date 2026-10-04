import { chipClass } from '@/shared/ui/formClasses'

export type SettingsScope = 'all' | 'account'

/**
 * Where a change applies (ADR 0024, D1 and D3): to all your accounts (the
 * general values) or only to this one. Shown only when there is more than one
 * account; otherwise everything is "this account".
 */
export function ScopeChoice({ value, onChange, disabled }: { value: SettingsScope; onChange: (scope: SettingsScope) => void; disabled?: boolean }) {
  const options: { value: SettingsScope; label: string }[] = [
    { value: 'all', label: 'Aplica a todas tus cuentas' },
    { value: 'account', label: 'Solo esta cuenta' },
  ]
  return (
    <div role="radiogroup" aria-label="Dónde aplica" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={chipClass(value === o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
