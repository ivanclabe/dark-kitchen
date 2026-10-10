import { groupNational, PHONE_COUNTRIES, readTyped, splitE164, toE164 } from '@/shared/utils/phone'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { inputClass } from './formClasses'

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'>

/**
 * A phone with its country (ADR 0039): 🇨🇴 +57 by default, the number grouped
 * while typing («300 123 4567»). Out: E.164 (+573001234567) when the number is
 * valid; the typed text otherwise (so `phoneError` can say what is wrong); ''
 * when empty. A stored value that is not a phone (a WhatsApp id) is shown as
 * it is and comes back unchanged until it is edited.
 */
export function PhoneInput({
  value,
  onValueChange,
  className,
  ...rest
}: NativeProps & { value: string | null | undefined; onValueChange: (value: string) => void }) {
  const initial = splitE164(value)
  const [country, setCountry] = useState(initial.country)
  const [text, setText] = useState(() => (value?.startsWith('+') ? groupNational(initial.country, initial.national) : (value ?? '')))
  const emitted = useRef(value ?? '')

  useEffect(() => {
    const next = value ?? ''
    if (next !== emitted.current) {
      emitted.current = next
      const s = splitE164(next)
      setCountry(s.country)
      setText(next.startsWith('+') ? groupNational(s.country, s.national) : next)
    }
  }, [value])

  function emit(nextCountry: string, nextText: string) {
    const digits = nextText.replace(/\D/g, '')
    const out = digits ? (toE164(nextCountry, nextText) ?? nextText.trim()) : ''
    emitted.current = out
    onValueChange(out)
  }

  const selected = PHONE_COUNTRIES.find((c) => c.code === country) ?? PHONE_COUNTRIES[0]
  return (
    <div className={clsx('mt-1.5 flex min-w-0 gap-2', className)}>
      {/* Fixed narrow width for the country (flag, code and arrow); the number takes the rest. */}
      <label className="relative w-24 shrink-0">
        <span className="sr-only">País del teléfono</span>
        <select
          value={country}
          disabled={rest.disabled}
          onChange={(e) => {
            setCountry(e.target.value)
            emit(e.target.value, text)
          }}
          className={clsx(inputClass, '!mt-0 cursor-pointer appearance-none pr-2 pl-2.5 tabular-nums')}
          aria-label={`País: ${selected.label}`}
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} +{c.dial} {c.label}
            </option>
          ))}
        </select>
        {/* The closed select shows the flag and the code only. */}
        <span className="pointer-events-none absolute inset-px flex items-center gap-1.5 rounded-[7px] bg-neutral-900 pr-2 pl-2.5 text-sm text-neutral-100" aria-hidden>
          <span>{selected.flag}</span>
          <span className="tabular-nums">+{selected.dial}</span>
          <ChevronDown size={14} className="ml-auto text-neutral-500" />
        </span>
      </label>
      <input
        {...rest}
        type="tel"
        inputMode="tel"
        autoComplete={rest.autoComplete ?? 'tel-national'}
        value={text}
        placeholder={rest.placeholder ?? (country === 'CO' ? '300 123 4567' : '')}
        onChange={(e) => {
          const raw = e.target.value
          // Letters mean it is not a phone (an old identifier): keep it as typed.
          if (/[a-z]/i.test(raw)) {
            setText(raw)
            emit(country, raw)
            return
          }
          const { country: nextCountry, digits } = readTyped(country, raw)
          const next = groupNational(nextCountry, digits)
          if (nextCountry !== country) setCountry(nextCountry)
          setText(next)
          emit(nextCountry, next)
        }}
        className={clsx(inputClass, '!mt-0 min-w-0 flex-1 tabular-nums')}
      />
    </div>
  )
}
