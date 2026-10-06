import { normalizeEmail } from '@/shared/utils/email'
import { forwardRef, type InputHTMLAttributes } from 'react'
import { Input } from './FormField'

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>

/**
 * An e-mail (ADR 0039): the e-mail keyboard and autofill, and on leaving the
 * field it loses spaces and capitals. Validate with `emailError`.
 */
export const EmailInput = forwardRef<HTMLInputElement, NativeProps & { value: string; onValueChange: (value: string) => void }>(function EmailInput(
  { value, onValueChange, onBlur, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      {...rest}
      type="email"
      inputMode="email"
      autoComplete={rest.autoComplete ?? 'email'}
      autoCapitalize="none"
      spellCheck={false}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onBlur={(e) => {
        const clean = normalizeEmail(e.target.value)
        if (clean !== value) onValueChange(clean)
        onBlur?.(e)
      }}
    />
  )
})
