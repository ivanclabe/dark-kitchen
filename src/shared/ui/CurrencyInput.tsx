import { formatLocaleNumber, groupWhileTyping, parseLocaleNumber } from '@/shared/utils/numberInput'
import clsx from 'clsx'
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { inputClass } from './formClasses'

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode' | 'defaultValue'>

/**
 * Pesos colombianos (ADR 0039): «$ 1.250.000 COP» while typing, a clean number
 * out (or null when empty). Whole pesos by default; `decimals={2}` where there
 * are cents (a cost per gram). Never negative.
 */
export function CurrencyInput({
  value,
  onValueChange,
  decimals = 0,
  className,
  ...rest
}: NativeProps & {
  value: number | null | undefined
  onValueChange: (value: number | null) => void
  decimals?: 0 | 2
}) {
  const [text, setText] = useState(() => formatLocaleNumber(value ?? null, { decimals }))
  const emitted = useRef<number | null>(value ?? null)

  // A new value from outside (a form reset, another row): show it.
  useEffect(() => {
    const next = value ?? null
    if (next !== emitted.current) {
      emitted.current = next
      setText(formatLocaleNumber(next, { decimals }))
    }
  }, [value, decimals])

  return (
    <div className={clsx('relative mt-1.5', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-neutral-500" aria-hidden>
        $
      </span>
      <input
        {...rest}
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const next = groupWhileTyping(e.target.value, decimals)
          setText(next)
          const n = parseLocaleNumber(next, { decimals })
          emitted.current = n
          onValueChange(n)
        }}
        onBlur={(e) => {
          // «12,» or «12,5» with whole pesos: tidy to what will be saved.
          setText(formatLocaleNumber(emitted.current, { decimals }))
          rest.onBlur?.(e)
        }}
        className={clsx(inputClass, '!mt-0 pr-14 pl-7 tabular-nums')}
      />
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs font-medium text-neutral-500" aria-hidden>
        COP
      </span>
    </div>
  )
}
