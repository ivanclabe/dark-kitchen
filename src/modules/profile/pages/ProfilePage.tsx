import { Avatar } from '@/shared/avatars/Avatar'
import { resolveAvatarKey, type AvatarKey } from '@/shared/avatars/catalog'
import { useAuth } from '@/shared/hooks/useAuth'
import { kitchenPath, useActiveKitchen, useMyKitchens } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormActions, FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import { initials } from '@/shared/utils/format'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, MapPin, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AvatarPicker } from '@/shared/avatars/GalleryPicker'
import { changeMyPassword, updateMyProfile } from '../api/profile'

/**
 * Mi perfil (ADR 0008, Fase A): nombre, avatar y contraseña de la persona,
 * y dónde tiene acceso. El nombre y el avatar son de la persona, no de la
 * Cuenta: se ven igual en todas sus Cuentas.
 */
export function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth()
  const { show } = useToast()

  const savedAvatar = resolveAvatarKey(profile?.avatarKey, profile?.id)
  const [fullName, setFullName] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<AvatarKey | null>(null)
  const name = fullName ?? profile?.fullName ?? ''
  const currentAvatar = avatar ?? savedAvatar
  const dirty = (fullName !== null && fullName.trim() !== profile?.fullName) || (avatar !== null && avatar !== savedAvatar)
  const nameError = name.trim().length >= 2 ? null : 'Mínimo 2 caracteres'

  const save = useMutation({
    mutationFn: () => updateMyProfile({ fullName: name.trim(), avatarKey: currentAvatar }),
    onSuccess: async () => {
      await refreshProfile()
      setFullName(null)
      setAvatar(null)
      show('Perfil actualizado.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar el perfil'), 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (dirty && !nameError) save.mutate()
  }

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Mi perfil" icon={UserRound} description="Tu nombre, tu avatar y tu contraseña. Se ven igual en todas tus cuentas." />

      <form onSubmit={onSubmit}>
        <Card title="Tu perfil" icon={UserRound}>
          <div className="mb-5 flex items-center gap-4">
            <Avatar avatarKey={currentAvatar} size="xl" label={`Tu avatar: ${name}`} />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-neutral-50">{name || '—'}</p>
              <p className="truncate text-sm text-neutral-500">{user?.email}</p>
            </div>
          </div>
          <FormGrid>
            <FormField label="Nombre" required error={fullName !== null ? nameError : null}>
              {(a11y) => <Input {...a11y} value={name} onChange={(e) => setFullName(e.target.value)} maxLength={80} autoComplete="name" />}
            </FormField>
            <FormField label="Correo" hint="Es tu usuario para entrar. No se cambia desde aquí.">
              {(a11y) => <Input {...a11y} value={user?.email ?? ''} readOnly disabled />}
            </FormField>
          </FormGrid>
          <div className="mt-5">
            <p className={`mb-2 ${typography.label}`}>Avatar</p>
            <AvatarPicker value={currentAvatar} onChange={setAvatar} />
            <p className={`mt-2 ${typography.caption}`}>Elige uno de los avatares de la galería. Por ahora no se pueden subir fotos.</p>
          </div>
          <FormActions className="mt-4">
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setFullName(null)
                  setAvatar(null)
                }}
                disabled={save.isPending}
              >
                Descartar
              </Button>
            )}
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty || Boolean(nameError)}>
              Guardar cambios
            </Button>
          </FormActions>
        </Card>
      </form>

      <PasswordCard email={user?.email ?? ''} />
      <AccessCard />
    </div>
  )
}

function PasswordCard({ email }: { email: string }) {
  const { show } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const nextError = next && next.length < 8 ? 'Mínimo 8 caracteres' : next && next === current ? 'Debe ser distinta de la actual' : null
  const confirmError = confirm && confirm !== next ? 'No coincide' : null
  const ready = Boolean(current && next && confirm) && !nextError && !confirmError

  const change = useMutation({
    mutationFn: () => changeMyPassword(email, current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
      show('Contraseña actualizada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar la contraseña'), 'error'),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) change.mutate()
      }}
    >
      <Card title="Contraseña" description="Para cambiarla, confirma primero la actual." icon={KeyRound}>
        {/* Campo oculto con el usuario: ayuda a los gestores de contraseñas a guardar la nueva. */}
        <input type="email" value={email} autoComplete="username" readOnly hidden />
        <FormGrid cols={3}>
          <FormField label="Contraseña actual" required>
            {(a11y) => <Input {...a11y} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />}
          </FormField>
          <FormField label="Nueva contraseña" required error={nextError}>
            {(a11y) => <Input {...a11y} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />}
          </FormField>
          <FormField label="Repite la nueva" required error={confirmError}>
            {(a11y) => <Input {...a11y} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
          </FormField>
        </FormGrid>
        <FormActions className="mt-4">
          <Button type="submit" variant="primary" loading={change.isPending} disabled={!ready}>
            Cambiar contraseña
          </Button>
        </FormActions>
      </Card>
    </form>
  )
}

function AccessCard() {
  const { kitchen } = useActiveKitchen()
  const { data: kitchens } = useMyKitchens()
  return (
    <Card title="Dónde tengo acceso" description="Tus cuentas y tu rol en cada una. Los cambia un administrador." icon={MapPin} padding={false}>
      <ul className="divide-y divide-neutral-800/60">
        {(kitchens ?? []).map((k) => (
          <li key={k.id} className="flex items-center gap-3 px-5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brasa-500/15 text-[11px] font-bold text-brasa-300">{initials(k.name)}</span>
            <Link to={kitchenPath(k.slug, '/')} className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100 hover:text-brasa-300">
              {k.name}
            </Link>
            {k.id === kitchen.id && (
              <Badge tone="brand" size="sm">
                Actual
              </Badge>
            )}
            {!k.active && (
              <Badge tone="warning" size="sm">
                Desactivada
              </Badge>
            )}
            <span className="shrink-0 text-sm text-neutral-400">{k.roleName}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
