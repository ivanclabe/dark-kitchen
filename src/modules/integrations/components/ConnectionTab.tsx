import { Badge } from '@/shared/ui/Badge'
import { Feedback } from '@/shared/ui/Feedback'
import { Button, IconButton } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormField, FormGrid, Input } from '@/shared/ui/FormField'
import { ConfirmDialog } from '@/shared/ui/Modal'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { formatDateTime } from '@/shared/utils/format'
import clsx from 'clsx'
import { Copy, ExternalLink, FlaskConical, KeyRound, Link2, Plug, Plus, RefreshCw, ShieldCheck, Unplug, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useWaActions } from '../hooks'
import { prettyPhone, webhookUrl } from '../lib/whatsapp'
import type { WaMode, WaSettings } from '../types'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-200">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 text-sm text-neutral-300">
        <p className="font-medium text-neutral-100">{title}</p>
        {children}
      </div>
    </li>
  )
}

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const { show } = useToast()
  return (
    <div>
      <p className="mb-1 text-xs text-neutral-500">{label}</p>
      <div className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2">
        <span className={clsx('min-w-0 flex-1 text-sm break-all text-neutral-100', mono && 'font-mono')}>{value}</span>
        <IconButton
          icon={Copy}
          size="sm"
          variant="ghost"
          aria-label={`Copiar ${label}`}
          onClick={() =>
            void navigator.clipboard.writeText(value).then(
              () => show('Copiado.'),
              () => show('No se pudo copiar.', 'error'),
            )
          }
        />
      </div>
    </div>
  )
}

const MODES: { value: WaMode; label: string; hint: string }[] = [
  { value: 'test', label: 'Prueba', hint: 'Solo se envía a los números autorizados abajo. Úsalo hasta que todo funcione.' },
  { value: 'live', label: 'Producción', hint: 'Se envía a todos los clientes que aceptaron recibir avisos.' },
  { value: 'simulator', label: 'Simulador', hint: 'Para pruebas de la plataforma: nada sale a Meta.' },
]

/**
 * Conexión (ADR 0055): the steps in Meta, the IDs and secrets (they go to
 * Vault and never come back), the webhook to paste in Meta, «Probar
 * conexión», test or production mode, and disconnect.
 */
export function ConnectionTab({ settings }: { settings: WaSettings }) {
  const { show } = useToast()
  const actions = useWaActions()
  const account = settings.account
  const [phoneNumberId, setPhoneNumberId] = useState(account?.phoneNumberId ?? '')
  const [wabaId, setWabaId] = useState(account?.wabaId ?? '')
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [verifyToken, setVerifyToken] = useState<string | null>(null)
  const [newNumber, setNewNumber] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const canManage = settings.canManage

  async function connect() {
    try {
      const result = await actions.connect.mutateAsync({ phoneNumberId, wabaId, accessToken: token, appSecret: secret })
      setToken('')
      setSecret('')
      if (result.verifyToken) setVerifyToken(result.verifyToken)
      await check(true)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar la conexión'), 'error')
    }
  }

  async function check(afterSave = false) {
    try {
      const r = await actions.admin.mutateAsync('check')
      show(afterSave ? `Conectado: ${String(r.verifiedName ?? r.displayPhone ?? 'tu número')}.` : 'La conexión funciona.')
    } catch (err) {
      show(getErrorMessage(err, 'Meta no aceptó la conexión'), 'error')
    }
  }

  async function regenerate() {
    try {
      setVerifyToken(await actions.regenerate.mutateAsync())
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo generar'), 'error')
    }
  }

  async function save(patch: Parameters<typeof actions.save.mutateAsync>[0], done?: string) {
    try {
      await actions.save.mutateAsync(patch)
      if (done) show(done)
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar'), 'error')
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        {!settings.featureEnabled && (
          <Feedback
            tone="warning"
            role={null}
            description="Los avisos por WhatsApp no están activos para esta cuenta (plan u organización). Puedes conectar el número, pero no se enviarán avisos."
          />
        )}

        <Card title="Conecta tu número oficial" icon={Plug} description="WhatsApp Business Platform (API de Meta). Tu número, tu cuenta de Meta: Quanela solo envía en tu nombre.">
          <ol className="space-y-5">
            <Step n={1} title="En Meta, prepara tu app y tu número">
              <ul className="list-disc space-y-1 pl-4 text-neutral-400">
                <li>
                  En <span className="text-neutral-200">developers.facebook.com</span> crea una app de tipo Empresa y agrégale el producto WhatsApp.
                </li>
                <li>Agrega y verifica tu número de WhatsApp Business. Copia su Phone Number ID y el WhatsApp Business Account ID.</li>
                <li>
                  En el Business Manager, crea un usuario del sistema con los permisos <code className="text-neutral-200">whatsapp_business_messaging</code> y{' '}
                  <code className="text-neutral-200">whatsapp_business_management</code> y genera un token permanente.
                </li>
                <li>En la app, Configuración → Básica, copia la clave secreta (App Secret).</li>
              </ul>
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brasa-400 hover:underline"
              >
                Guía de Meta <ExternalLink size={12} aria-hidden />
              </a>
            </Step>
            <Step n={2} title="Pega los datos aquí">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void connect()
                }}
              >
                <FormGrid>
                  <FormField label="Phone Number ID">
                    {(a11y) => <Input {...a11y} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value.trim())} inputMode="numeric" disabled={!canManage} />}
                  </FormField>
                  <FormField label="WhatsApp Business Account ID">
                    {(a11y) => <Input {...a11y} value={wabaId} onChange={(e) => setWabaId(e.target.value.trim())} inputMode="numeric" disabled={!canManage} />}
                  </FormField>
                  <FormField label="Token de acceso" hint={account?.hasAccessToken ? 'Guardado. Déjalo vacío para conservarlo.' : 'Permanente, del usuario del sistema.'}>
                    {(a11y) => (
                      <Input {...a11y} type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder={account?.hasAccessToken ? '••••••••••••' : ''} disabled={!canManage} />
                    )}
                  </FormField>
                  <FormField label="App Secret" hint={account?.hasAppSecret ? 'Guardado. Déjalo vacío para conservarlo.' : 'Para verificar que los avisos de Meta son reales.'}>
                    {(a11y) => (
                      <Input {...a11y} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder={account?.hasAppSecret ? '••••••••••••' : ''} disabled={!canManage} />
                    )}
                  </FormField>
                </FormGrid>
                <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <ShieldCheck size={13} aria-hidden /> El token y el App Secret se guardan cifrados y nunca vuelven a mostrarse.
                </p>
                {canManage && (
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      icon={Plug}
                      loading={actions.connect.isPending || actions.admin.isPending}
                      disabled={!phoneNumberId || !wabaId || (!account?.hasAccessToken && !token) || (!account?.hasAppSecret && !secret)}
                    >
                      {account ? 'Guardar y verificar' : 'Conectar'}
                    </Button>
                  </div>
                )}
              </form>
            </Step>
            <Step n={3} title="En Meta, configura el webhook">
              <p className="text-neutral-400">
                En tu app: WhatsApp → Configuración → Webhook. Pega la URL y el token de verificación, y suscríbete al campo <code className="text-neutral-200">messages</code>. Así sabremos si cada aviso
                llegó y se leyó.
              </p>
              <CopyField label="URL del webhook" value={webhookUrl()} />
              {verifyToken ? (
                <div className="space-y-1">
                  <CopyField label="Token de verificación (cópialo ahora: no se vuelve a mostrar)" value={verifyToken} />
                </div>
              ) : account ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <KeyRound size={13} aria-hidden /> El token de verificación ya se generó.
                  {canManage && (
                    <Button size="sm" variant="ghost" icon={RefreshCw} loading={actions.regenerate.isPending} onClick={() => void regenerate()}>
                      Generar uno nuevo
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-neutral-500">El token de verificación aparece al conectar.</p>
              )}
            </Step>
          </ol>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Estado" icon={Link2}>
          {!account ? (
            <p className="text-sm text-neutral-400">Aún no hay un número conectado.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {account.status === 'connected' ? (
                  <Badge tone="success" dot>
                    Conectado
                  </Badge>
                ) : account.status === 'error' ? (
                  <Badge tone="danger" dot>
                    Error
                  </Badge>
                ) : (
                  <Badge tone="warning" dot>
                    Falta verificar
                  </Badge>
                )}
                {account.qualityRating && <Badge tone="neutral">Calidad: {account.qualityRating}</Badge>}
              </div>
              {(account.verifiedName || account.displayPhone) && (
                <p className="text-neutral-100">
                  {account.verifiedName} {account.displayPhone && <span className="text-neutral-400">· {account.displayPhone}</span>}
                </p>
              )}
              {account.lastError && <p className="text-red-400">{account.lastError}</p>}
              {account.lastCheckAt && <p className="text-xs text-neutral-500">Última verificación: {formatDateTime(account.lastCheckAt)}</p>}
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={RefreshCw} loading={actions.admin.isPending} onClick={() => void check()}>
                    Probar conexión
                  </Button>
                  <Button size="sm" variant="ghost" icon={Unplug} onClick={() => setConfirmDisconnect(true)}>
                    Desconectar
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {account && (
          <Card title="Modo" icon={FlaskConical} description="Empieza en prueba: solo les llegan avisos a los números que autorices.">
            <div className="space-y-3">
              <div className="space-y-2" role="radiogroup" aria-label="Modo de envío">
                {MODES.filter((m) => m.value !== 'simulator' || account.mode === 'simulator' || import.meta.env.DEV).map((m) => (
                  <label key={m.value} className={clsx('flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5', account.mode === m.value ? 'border-brasa-500/60 bg-brasa-500/5' : 'border-neutral-800')}>
                    <input
                      type="radio"
                      name="mode"
                      className="mt-1 accent-brasa-500"
                      checked={account.mode === m.value}
                      disabled={!canManage}
                      onChange={() => void save({ mode: m.value }, m.value === 'live' ? 'Modo producción: los avisos llegan a todos los clientes que aceptaron.' : 'Modo guardado.')}
                    />
                    <span>
                      <span className="block text-sm font-medium text-neutral-100">{m.label}</span>
                      <span className="block text-xs text-neutral-500">{m.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {account.mode === 'test' && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-400">Números autorizados (máximo 10)</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {account.testRecipients.map((n) => (
                      <li key={n} className="inline-flex items-center gap-1 rounded-full bg-neutral-800 py-1 pr-1 pl-3 text-xs text-neutral-200 tabular-nums">
                        {prettyPhone(n)}
                        {canManage && (
                          <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-neutral-700"
                            aria-label={`Quitar ${n}`}
                            onClick={() => void save({ testRecipients: account.testRecipients.filter((x) => x !== n) })}
                          >
                            <X size={12} aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                    {account.testRecipients.length === 0 && <li className="text-xs text-neutral-500">Ninguno todavía.</li>}
                  </ul>
                  {canManage && account.testRecipients.length < 10 && (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (!newNumber.trim()) return
                        void save({ testRecipients: [...account.testRecipients, newNumber.trim()] }, 'Número autorizado.').then(() => setNewNumber(''))
                      }}
                    >
                      <Input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="+57 300 123 4567" aria-label="Número a autorizar" inputMode="tel" />
                      <Button type="submit" size="sm" variant="secondary" icon={Plus}>
                        Agregar
                      </Button>
                    </form>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-3">
                <span className="text-sm text-neutral-300">Enviar avisos de pedidos</span>
                <Switch
                  checked={account.notificationsEnabled}
                  disabled={!canManage}
                  onChange={(v) => void save({ notificationsEnabled: v }, v ? 'Avisos activados.' : 'Avisos pausados.')}
                  label="Enviar avisos de pedidos"
                />
              </div>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={() =>
          void actions.disconnect.mutateAsync().then(
            () => {
              setConfirmDisconnect(false)
              setPhoneNumberId('')
              setWabaId('')
              show('WhatsApp desconectado. Se borraron el token y el App Secret.')
            },
            (err) => show(getErrorMessage(err, 'No se pudo desconectar'), 'error'),
          )
        }
        pending={actions.disconnect.isPending}
        title="¿Desconectar WhatsApp?"
        description="Se borran el token y el App Secret guardados y dejan de enviarse avisos (también los que estaban en cola). Tus pedidos no cambian."
        confirmLabel="Desconectar"
        danger
      />
    </div>
  )
}
