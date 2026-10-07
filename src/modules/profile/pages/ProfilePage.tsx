import { Avatar } from '@/shared/avatars/Avatar'
import { Page } from '@/shared/ui/Page'
import { resolveAvatarKey, type AvatarKey } from '@/shared/avatars/catalog'
import { useAuth } from '@/shared/hooks/useAuth'
import { kitchenPath, useActiveKitchen, useMyKitchens } from '@/shared/kitchen/activeKitchenContext'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormActions, FormField, Input } from '@/shared/ui/FormField'
import { PasswordInput } from '@/shared/ui/PasswordInput'
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
 * Cuenta: se ven igual en todas sus Cuentas. Campos cortos: el contenido
 * tiene ancho de lectura (como Configuración → General).
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
    <Page>
      <PageHeader help="switch-account" title="Mi perfil" icon={UserRound} description="Tu nombre, tu avatar y tu contraseña. Se ven igual en todas tus cuentas." />

      <div className="max-w-3xl space-y-6">
        <form onSubmit={onSubmit}>
          <Card title="Tu perfil" icon={UserRound}>
            <div className="mb-5 flex items-center gap-4">
              <Avatar avatarKey={currentAvatar} size="xl" label={`Tu avatar: ${name}`} />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-neutral-50">{name || '—'}</p>
                {user?.email && <p className="truncate text-sm text-neutral-400">{user.email}</p>}
                {user?.email && <p className={typography.caption}>Es tu usuario para entrar; no se cambia desde aquí.</p>}
              </div>
            </div>
            <FormField label="Nombre" required error={fullName !== null ? nameError : null} className="max-w-md">
              {(a11y) => <Input {...a11y} value={name} onChange={(e) => setFullName(e.target.value)} maxLength={80} autoComplete="name" />}
            </FormField>
            <div className="mt-5">
              <p className={`mb-2 ${typography.label}`}>Avatar</p>
              <AvatarPicker value={currentAvatar} onChange={setAvatar} />
              <p className={`mt-2 ${typography.caption}`}>Elige uno de la galería. Por ahora no se pueden subir fotos.</p>
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

        <SecurityCard email={user?.email ?? ''} providers={signInProviders(user)} />
        <AccessCard />
      </div>
    </Page>
  )
}

/** How this person signs in (Supabase keeps it in app_metadata). */
function signInProviders(user: { email?: string | null; app_metadata?: Record<string, unknown> } | null | undefined): string[] {
  const meta = user?.app_metadata ?? {}
  const list = Array.isArray(meta.providers) ? meta.providers.filter((p): p is string => typeof p === 'string') : []
  if (list.length) return list
  if (typeof meta.provider === 'string') return [meta.provider]
  return user?.email ? ['email'] : []
}

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', phone: 'tu teléfono' }

/**
 * Seguridad: la contraseña, plegada hasta que se quiere cambiar. Los campos
 * van uno debajo del otro, en el orden en que se llenan. Quien entra con
 * Google o con su teléfono no tiene contraseña en Quanela: se le dice, sin
 * un formulario que no le sirve.
 */
function SecurityCard({ email, providers }: { email: string; providers: string[] }) {
  const { show } = useToast()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const usesPassword = Boolean(email) && providers.includes('email')
  const nextError = next && next.length < 8 ? 'Mínimo 8 caracteres' : next && next === current ? 'Debe ser distinta de la actual' : null
  const confirmError = confirm && confirm !== next ? 'No coincide' : null
  const ready = Boolean(current && next && confirm) && !nextError && !confirmError

  function close() {
    setOpen(false)
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  const change = useMutation({
    mutationFn: () => changeMyPassword(email, current, next),
    onSuccess: () => {
      close()
      show('Contraseña actualizada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo cambiar la contraseña'), 'error'),
  })

  if (!usesPassword) {
    const via = providers.map((p) => PROVIDER_LABEL[p]).find(Boolean) ?? 'otro método'
    return (
      <Card title="Seguridad" icon={KeyRound}>
        <p className={typography.small}>Entras con {via}: no usas una contraseña de Quanela.</p>
      </Card>
    )
  }

  return (
    <Card
      title="Seguridad"
      description={open ? 'Para cambiarla, confirma primero la actual.' : 'La contraseña con la que entras con tu correo.'}
      icon={KeyRound}
      action={
        !open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Cambiar contraseña
          </Button>
        )
      }
    >
      {!open ? (
        <p className="text-sm text-neutral-300">
          Contraseña <span className="ml-2 tracking-widest text-neutral-500" aria-hidden>••••••••</span>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) change.mutate()
          }}
          className="max-w-sm space-y-4"
        >
          {/* Campo oculto con el usuario: ayuda a los gestores de contraseñas a guardar la nueva. */}
          <input type="email" value={email} autoComplete="username" readOnly hidden />
          <FormField label="Contraseña actual" required>
            {(a11y) => <PasswordInput {...a11y} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />}
          </FormField>
          <FormField label="Nueva contraseña" required error={nextError} hint="Mínimo 8 caracteres.">
            {(a11y) => <PasswordInput {...a11y} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />}
          </FormField>
          <FormField label="Repite la nueva" required error={confirmError}>
            {(a11y) => <PasswordInput {...a11y} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
          </FormField>
          <FormActions>
            <Button variant="ghost" onClick={close} disabled={change.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={change.isPending} disabled={!ready}>
              Guardar contraseña
            </Button>
          </FormActions>
        </form>
      )}
    </Card>
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
