import { Minus, Plus } from 'lucide-react'
import type { ChangeEvent } from 'react'

export function NumberStepper({
  value,
  onChange,
  min = 0,
  step = 1,
  required,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  step?: number
  required?: boolean
}) {
  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const next = Number(e.target.value)
    onChange(Number.isNaN(next) ? min : next)
  }

  return (
    <div className="mt-1 flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 focus-within:border-brasa-500 focus-within:ring-2 focus-within:ring-brasa-500/20">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="px-3 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
        aria-label="Disminuir"
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        value={value}
        onChange={handleInputChange}
        min={min}
        step={step}
        required={required}
        className="w-full min-w-0 border-x border-neutral-700 bg-transparent py-2 text-center text-sm text-neutral-50 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className="px-3 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
        aria-label="Aumentar"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
