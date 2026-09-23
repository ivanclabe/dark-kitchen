import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { inputClass, labelClass } from './formClasses'
import { typography } from './typography'

/**
 * Campo de formulario del Design System: label asociada por htmlFor, hint,
 * y mensaje de error con role="alert". El control hijo recibe el id vía
 * render-prop para que el label lo apunte de verdad (antes ningún form
 * asociaba label ↔ input).
 */
export function FormField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: (props: { id: string; 'aria-invalid': boolean | undefined; 'aria-describedby': string | undefined }) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={clsx('min-w-0', className)}>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && (
          <span className="ml-0.5 text-brasa-400" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className={`mt-1.5 ${typography.caption}`}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(inputClass, className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={clsx(inputClass, 'resize-y', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={clsx(inputClass, 'appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-neutral-500" aria-hidden />
    </div>
  )
})

/** Contenedor de formulario: agrupa campos con spacing consistente y grid responsivo. */
export function FormGrid({ cols = 2, className, children }: { cols?: 1 | 2 | 3 | 4; className?: string; children: ReactNode }) {
  const grid = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' }[cols]
  return <div className={clsx('grid gap-4', grid, className)}>{children}</div>
}

/** Fila de acciones al pie de un formulario (secundaria a la izquierda, primaria a la derecha). */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('flex flex-wrap items-center justify-end gap-2 pt-2', className)}>{children}</div>
}
