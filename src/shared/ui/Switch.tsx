import clsx from 'clsx'

/** Interruptor on/off con semántica ARIA real (role="switch"). La etiqueta visible la pone el caller; `label` es la accesible. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50',
        // Off: neutral-600 reaches 3:1 against the page in every theme (the 700 track blended in).
        checked ? 'bg-primary' : 'bg-neutral-600',
      )}
    >
      <span className={clsx('size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} aria-hidden />
    </button>
  )
}
