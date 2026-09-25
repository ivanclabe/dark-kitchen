import clsx from 'clsx'
import { useId } from 'react'
import { ACCOUNT_ICON_ART, type AvatarArt } from './art/accountIcons'
import { PERSON_AVATAR_ART } from './art/personAvatars'
import { ACCOUNT_ICON_LABELS, AVATAR_LABELS, resolveAccountIconKey, resolveAvatarKey, type AccountIconKey, type AvatarKey } from './catalog'

/**
 * Un solo renderizador para las dos galerías (ADR 0009): tarjeta oscura con
 * degradado, brillo sutil arriba a la derecha y la ilustración de 64×64.
 */
function Artwork({ art, artKey, className, label }: { art: AvatarArt; artKey: string; className?: string; label?: string }) {
  const gradientId = useId()
  return (
    <svg
      viewBox="0 0 64 64"
      className={clsx('overflow-hidden', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-avatar={artKey}
    >
      {label && <title>{label}</title>}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={art.bg[0]} />
          <stop offset="1" stopColor={art.bg[1]} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${gradientId})`} />
      <circle cx="54" cy="10" r="16" fill="#fff" opacity=".05" />
      {art.art}
    </svg>
  )
}

const SIZE_CLASS = { xs: 'size-6 rounded-md', sm: 'size-8 rounded-lg', md: 'size-10 rounded-xl', lg: 'size-14 rounded-2xl', xl: 'size-20 rounded-3xl' } as const

export type AvatarSize = keyof typeof SIZE_CLASS

/** Solo el dibujo de un avatar de persona (para el selector). */
export function AvatarArtwork({ avatarKey, className, label }: { avatarKey: AvatarKey; className?: string; label?: string }) {
  return <Artwork art={PERSON_AVATAR_ART[avatarKey]} artKey={avatarKey} className={className} label={label} />
}

/** Solo el dibujo de un icono de Cuenta (para el selector). */
export function AccountIconArtwork({ iconKey, className, label }: { iconKey: AccountIconKey; className?: string; label?: string }) {
  return <Artwork art={ACCOUNT_ICON_ART[iconKey]} artKey={iconKey} className={className} label={label} />
}

/**
 * Avatar de una persona. Si `avatarKey` no es de la galería (o está vacío),
 * usa el avatar fijo derivado de `seed` (el id del usuario).
 */
export function Avatar({
  avatarKey,
  seed,
  size = 'md',
  className,
  label,
}: {
  avatarKey?: string | null
  seed?: string | null
  size?: AvatarSize
  className?: string
  /** Texto para lectores de pantalla; sin él, el avatar es decorativo. */
  label?: string
}) {
  const key = resolveAvatarKey(avatarKey, seed)
  return <AvatarArtwork avatarKey={key} className={clsx(SIZE_CLASS[size], 'shrink-0', className)} label={label} />
}

/**
 * Icono de una Cuenta (representa al establecimiento, no a una persona). Si
 * `iconKey` no es de la galería, usa el derivado de `seed` (el id de la Cuenta).
 */
export function AccountIcon({
  iconKey,
  seed,
  size = 'md',
  className,
  label,
}: {
  iconKey?: string | null
  seed?: string | null
  size?: AvatarSize
  className?: string
  label?: string
}) {
  const key = resolveAccountIconKey(iconKey, seed)
  return <AccountIconArtwork iconKey={key} className={clsx(SIZE_CLASS[size], 'shrink-0', className)} label={label} />
}

export { ACCOUNT_ICON_LABELS, AVATAR_LABELS }
