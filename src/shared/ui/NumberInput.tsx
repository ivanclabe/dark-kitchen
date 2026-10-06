import { formatLocaleNumber, parseLocaleNumber } from '@/shared/utils/numberInput'
import clsx from 'clsx'
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { inputClass } from './formClasses'

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode' | 'defaultValue' | 'min' | 'max'>

/**
 * A quantity, minutes, days… (ADR 0039): the Colombian decimal comma works,
 * the phone opens the right keyboard and the unit is shown inside the field
 * («g», «min», «días»). A clean number out (or null when empty).
 */
export function NumberInput({
  value,
  onValueChange,
  decimals = 0,
  unit,
  min,
  max,
  allowNegative = false,
  className,
  ...rest
}: NativeProps & {
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  /** 0: whole numbers (minutes, units). 2 or 3: quantities in kg, l… */
  decimals?: number
  unit?: string
  min?: number
  max?: number
  /** An adjustment can subtract («-2,5»). */
  allowNegative?: boolean
}) {
  const [text, setText] = useState(() => formatLocaleNumber(value ?? null, { decimals }))
  const emitted = useRef<number | null>(value ?? null)

  useEffect(() => {
    const next = value ?? null
    if (next !== emitted.current) {
      emitted.current = next
      setText(formatLocaleNumber(next, { decimals }))
    }
  }, [value, decimals])

  return (
    <div className={clsx('relative mt-1.5', className)}>
      <input
        {...rest}
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          // Digits, and one decimal comma when decimals are allowed (a «.» typed by habit counts as one).
          const negative = allowNegative && e.target.value.trim().startsWith('-')
          let raw = e.target.value.replace(decimals ? /[^\d,.]/g : /\D/g, '')
          if (decimals) {
            raw = raw.replace('.', ',')
            const [a, ...b] = raw.split(',')
            raw = b.length ? `${a},${b.join('').replace(/\D/g, '').slice(0, decimals)}` : a
          }
          if (negative) raw = `-${raw}`
          setText(raw)
          let n = raw === '-' ? null : parseLocaleNumber(raw.replace(/\./g, ''), { decimals })
          if (n !== null && max !== undefined && n > max) n = max
          emitted.current = n
          onValueChange(n)
        }}
        onBlur={(e) => {
          let n = emitted.current
          if (n !== null && min !== undefined && n < min) {
            n = min
            emitted.current = n
            onValueChange(n)
          }
          setText(formatLocaleNumber(n, { decimals }))
          rest.onBlur?.(e)
        }}
        className={clsx(inputClass, '!mt-0 tabular-nums', unit && 'pr-14')}
      />
      {unit && (
        <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-neutral-500" aria-hidden>
          {unit}
        </span>
      )}
    </div>
  )
}
