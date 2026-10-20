import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { FormField, Input } from '@/shared/ui/FormField'
import { Modal } from '@/shared/ui/Modal'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { getErrorMessage } from '@/shared/utils/errors'
import { BellRing, CloudUpload, PencilLine, RefreshCw, Send } from 'lucide-react'
import { useState } from 'react'
import { useWaActions } from '../hooks'
import { EVENTS, META_STATUS, previewBody, VAR_LABEL } from '../lib/whatsapp'
import type { WaSettings, WaTemplate } from '../types'

/**
 * Avisos (ADR 0055): which order status changes send a WhatsApp, with which
 * template. Outside the 24 h window Meta only allows approved templates: the
 * suggested ones are created in the account's WABA with one button.
 */
export function NotificationsTab({ settings }: { settings: WaSettings }) {
  const { show } = useToast()
  const actions = useWaActions()
  const [testing, setTesting] = useState<WaTemplate | null>(null)
  const [testTo, setTestTo] = useState('')
  const [editing, setEditing] = useState<WaTemplate | null>(null)
  const [ownName, setOwnName] = useState('')
  const [ownLanguage, setOwnLanguage] = useState('es')
  const connected = settings.account?.status === 'connected'
  const canManage = settings.canManage
  const business = settings.account?.verifiedName ?? 'Tu negocio'

  async function admin(action: 'create_templates' | 'sync_templates') {
    try {
      const r = await actions.admin.mutateAsync(action)
      const problems = (r.problems as string[] | undefined) ?? []
      if (problems.length) show(`Algunas plantillas no se crearon: ${problems[0]}`, 'error')
      else show(action === 'create_templates' ? 'Plantillas enviadas a Meta para revisión. Suele tardar unos minutos.' : 'Estado de las plantillas actualizado.')
    } catch (err) {
      show(getErrorMessage(err, 'Meta no respondió'), 'error')
    }
  }

  async function toggle(t: WaTemplate, enabled: boolean) {
    try {
      await actions.saveTemplate.mutateAsync({ event: t.event, enabled })
    } catch (err) {
      show(getErrorMessage(err, 'No se pudo guardar'), 'error')
    }
  }

  return (
    <div className="space-y-4">
      {!settings.account && <p className="rounded-xl border border-neutral-800 px-4 py-3 text-sm text-neutral-400">Conecta tu número en la pestaña Conexión para activar los avisos.</p>}

      <Card
        title="Plantillas en Meta"
        icon={CloudUpload}
        description="Fuera de una conversación activa, WhatsApp solo deja enviar plantillas aprobadas por Meta. quanela trae plantillas listas, de tipo «utilidad»."
        action={
          canManage &&
          connected && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={RefreshCw} loading={actions.admin.isPending && actions.admin.variables === 'sync_templates'} onClick={() => void admin('sync_templates')}>
                Actualizar estado
              </Button>
              <Button size="sm" variant="primary" icon={CloudUpload} loading={actions.admin.isPending && actions.admin.variables === 'create_templates'} onClick={() => void admin('create_templates')}>
                Crear plantillas en Meta
              </Button>
            </div>
          )
        }
      >
        <p className="text-xs text-neutral-500">Las variables se llenan solas con los datos de cada pedido. El enlace lleva al seguimiento del pedido en tu menú público.</p>
      </Card>

      <ul className="grid gap-3 lg:grid-cols-2">
        {EVENTS.map(({ event, label, when }) => {
          const t = settings.templates.find((x) => x.event === event)
          if (!t) return null
          const meta = META_STATUS[t.metaStatus]
          return (
            <li key={event} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
              <div className="flex items-start gap-3">
                <BellRing size={16} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-100">{label}</p>
                  <p className="text-xs text-neutral-500">{when}</p>
                </div>
                <Switch checked={t.enabled} onChange={(v) => void toggle(t, v)} disabled={!canManage} label={`Enviar «${label}»`} />
              </div>
              <div className="rounded-lg bg-[#0b141a] p-3">
                <p className="max-w-[90%] rounded-lg rounded-tl-none bg-[#202c33] px-3 py-2 text-sm whitespace-pre-wrap text-neutral-100">
                  {t.body ? previewBody(t.body, t.params, { business_name: business }) : `Plantilla propia «${t.templateName}» con: ${t.params.map((p) => VAR_LABEL[p]).join(', ')}.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <span className="font-mono text-neutral-500">
                  {t.templateName} · {t.language}
                </span>
                {t.metaReason && <span className="text-red-400">{t.metaReason}</span>}
                <span className="flex-1" />
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={PencilLine}
                    onClick={() => {
                      setEditing(t)
                      setOwnName(t.templateName)
                      setOwnLanguage(t.language)
                    }}
                  >
                    Plantilla
                  </Button>
                )}
                {canManage && connected && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Send}
                    onClick={() => {
                      setTesting(t)
                      setTestTo(settings.account?.testRecipients[0] ?? '')
                    }}
                  >
                    Probar
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Modal
        open={testing !== null}
        onClose={() => setTesting(null)}
        title="Enviar una prueba"
        description="Un aviso con datos de ejemplo. Míralo llegar en Registro."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTesting(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={Send}
              loading={actions.sendTest.isPending}
              disabled={!testTo.trim()}
              onClick={() =>
                testing &&
                void actions.sendTest.mutateAsync({ event: testing.event, to: testTo }).then(
                  () => {
                    show('Prueba en cola.')
                    setTesting(null)
                  },
                  (err) => show(getErrorMessage(err, 'No se pudo enviar'), 'error'),
                )
              }
            >
              Enviar
            </Button>
          </>
        }
      >
        <FormField label="Número de WhatsApp" hint={settings.account?.mode === 'test' ? 'En modo prueba, debe ser uno de los autorizados.' : undefined}>
          {(a11y) => <Input {...a11y} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+57 300 123 4567" inputMode="tel" />}
        </FormField>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Plantilla del aviso"
        description="Usa la sugerida, o el nombre de una plantilla tuya ya aprobada en Meta con las mismas variables, en este orden."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={actions.saveTemplate.isPending}
              disabled={!/^[a-z0-9_]{1,250}$/.test(ownName)}
              onClick={() =>
                editing &&
                void actions.saveTemplate.mutateAsync({ event: editing.event, enabled: editing.enabled, templateName: ownName, language: ownLanguage }).then(
                  () => {
                    show('Plantilla guardada.')
                    setEditing(null)
                  },
                  (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
                )
              }
            >
              Guardar
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <FormField label="Nombre en Meta" hint="Minúsculas, números y guion bajo.">
              {(a11y) => <Input {...a11y} value={ownName} onChange={(e) => setOwnName(e.target.value.trim())} className="font-mono" />}
            </FormField>
            <FormField label="Idioma" hint="Código de Meta, por ejemplo es, es_MX, es_CO.">
              {(a11y) => <Input {...a11y} value={ownLanguage} onChange={(e) => setOwnLanguage(e.target.value.trim())} className="font-mono" />}
            </FormField>
            <ol className="list-decimal space-y-0.5 pl-5 text-xs text-neutral-400">
              {editing.params.map((p) => (
                <li key={p}>{VAR_LABEL[p]}</li>
              ))}
            </ol>
          </div>
        )}
      </Modal>
    </div>
  )
}
