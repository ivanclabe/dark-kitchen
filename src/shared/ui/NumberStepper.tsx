import { Minus, Plus } from 'lucide-react'
import type { ChangeEvent } from 'react'

export function NumberStepper({
  value,
  onChange,
  min = 0,
  step = 1,
  required,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
  required?: boolean
  id?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const next = Number(e.target.value)
    onChange(Number.isNaN(next) ? min : next)
  }

  return (
    <div className="mt-1.5 flex items-stretch overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-700 focus-within:border-brasa-500 focus-within:ring-2 focus-within:ring-brasa-500/15">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="px-3 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
        aria-label="Disminuir"
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        value={value}
        onChange={handleInputChange}
        min={min}
        step={step}
        required={required}
        className="w-full min-w-0 border-x border-neutral-800 bg-transparent py-2.5 text-center text-sm tabular-nums text-neutral-50 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className="px-3 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
        aria-label="Aumentar"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
