import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * Jerarquía de acciones del Design System:
 *   primary   — LA acción principal de la pantalla (una por vista)
 *   secondary — acciones importantes pero no principales
 *   ghost     — acciones terciarias / de baja prominencia
 *   danger    — destructivas (cancelar pedido, desactivar…)
 *   link      — acciones inline en tablas ("Ver", "Editar")
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brasa-500 text-white hover:bg-brasa-400 active:bg-brasa-600 disabled:hover:bg-brasa-500',
  secondary:
    'border border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-50',
  ghost: 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
  danger:
    'border border-red-900/50 bg-red-950/30 text-red-400 hover:border-red-800 hover:bg-red-950/60 hover:text-red-300',
  link: 'text-brasa-400 hover:text-brasa-300 hover:underline underline-offset-4 !h-auto !px-0 !py-0 !rounded-none',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 [&_svg]:size-3.5',
  md: 'h-10 px-4 text-sm gap-2 [&_svg]:size-4',
  lg: 'h-11 px-5 text-sm gap-2 [&_svg]:size-4',
}

const BASE =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] disabled:active:scale-100'

/** Clases de botón para usar en <Link>/<a> u otros elementos que no puedan ser <Button>. */
export function buttonClass({ variant = 'secondary', size = 'md' }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return clsx(BASE, VARIANT[variant], SIZE[size])
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ComponentType<{ size?: number; className?: string }>
  iconRight?: ComponentType<{ size?: number; className?: string }>
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  className,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(buttonClass({ variant, size }), className)}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : Icon && <Icon aria-hidden />}
      {children}
      {!loading && IconRight && <IconRight aria-hidden />}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obligatorio: un botón de solo ícono no tiene texto visible. */
  'aria-label': string
  icon: ComponentType<{ size?: number; className?: string }>
  variant?: Extract<ButtonVariant, 'secondary' | 'ghost' | 'danger'>
  size?: ButtonSize
  /** Resalta el botón cuando representa un estado activo (p.ej. sonido encendido). */
  active?: boolean
}

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: 'size-8 [&_svg]:size-3.5',
  md: 'size-10 [&_svg]:size-4',
  lg: 'size-11 [&_svg]:size-[18px]',
}

/** Botón circular de un solo ícono para toolbars y headers. Siempre lleva aria-label. */
export function IconButton({ icon: Icon, variant = 'secondary', size = 'md', active, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        BASE,
        VARIANT[variant],
        ICON_SIZE[size],
        'p-0',
        active && (variant === 'ghost' ? 'bg-brasa-500/15 text-brasa-400' : 'border-brasa-500/50 text-brasa-400'),
        className,
      )}
      title={rest.title ?? rest['aria-label']}
      {...rest}
    >
      <Icon aria-hidden />
    </button>
  )
}
