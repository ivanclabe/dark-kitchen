import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { AccountIconArtwork, AvatarArtwork } from './Avatar'
import { ACCOUNT_ICONS, PERSON_AVATARS, type AccountIconKey, type AvatarKey, type Gallery } from './catalog'

/**
 * Selector de una galería como grupo de radio: clic o flechas para elegir.
 * El mismo para los avatares de personas y los iconos de Cuenta (ADR 0009).
 * No hay subida de imágenes.
 */
function GalleryPicker<K extends string>({
  gallery,
  value,
  onChange,
  render,
  label,
  compact = false,
}: {
  gallery: Gallery<K>
  value: K
  onChange: (key: K) => void
  render: (key: K) => ReactNode
  label?: string
  /** Siempre 5 columnas (para espacios angostos como un diálogo). */
  compact?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const keys = gallery.keys

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = keys.indexOf(value)
    const cols = !compact && window.matchMedia('(min-width: 640px)').matches ? 10 : 5
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]
    if (delta === undefined) return
    e.preventDefault()
    const next = keys[(index + delta + keys.length) % keys.length]
    onChange(next)
    refs.current[keys.indexOf(next)]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label ?? gallery.label} onKeyDown={onKeyDown} className={clsx('grid grid-cols-5 gap-2.5', !compact && 'sm:grid-cols-10')}>
      {keys.map((key, i) => {
        const selected = key === value
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={gallery.labels[key]}
            title={gallery.labels[key]}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(key)}
            className={clsx(
              'relative aspect-square rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900',
              selected ? 'ring-2 ring-brasa-500 ring-offset-2 ring-offset-neutral-900' : 'opacity-75 hover:opacity-100',
            )}
          >
            {render(key)}
            {selected && (
              <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-brasa-500 text-white ring-2 ring-neutral-900">
                <Check size={12} strokeWidth={3} aria-hidden />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Galería de avatares de personas (perfil). */
export function AvatarPicker({ value, onChange }: { value: AvatarKey; onChange: (key: AvatarKey) => void }) {
  return <GalleryPicker gallery={PERSON_AVATARS} value={value} onChange={onChange} render={(key) => <AvatarArtwork avatarKey={key} className="size-full rounded-2xl" />} />
}

/** Galería de iconos de establecimiento (Cuentas). */
export function AccountIconPicker({ value, onChange, compact }: { value: AccountIconKey; onChange: (key: AccountIconKey) => void; compact?: boolean }) {
  return (
    <GalleryPicker
      gallery={ACCOUNT_ICONS}
      value={value}
      onChange={onChange}
      compact={compact}
      render={(key) => <AccountIconArtwork iconKey={key} className="size-full rounded-2xl" />}
    />
  )
}
