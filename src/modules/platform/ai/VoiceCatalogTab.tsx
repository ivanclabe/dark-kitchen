import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable'
import { Drawer } from '@/shared/ui/Drawer'
import { Input, Select, Textarea } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { useToast } from '@/shared/ui/Toast'
import { typography } from '@/shared/ui/typography'
import { getErrorMessage } from '@/shared/utils/errors'
import {
  toVoiceSettings,
  VOICE_GENDER_LABEL,
  VOICE_LANG_LABEL,
  VOICE_LANGS,
  VOICE_PROFILES_KEY,
  VOICE_STYLE_META,
  VOICE_STYLES,
  type KitchenVoiceSettings,
  type VoiceGender,
  type VoiceLang,
  type VoiceProfile,
  type VoiceStyle,
} from '@/shared/voice/catalog'
import { useVoiceProfiles } from '@/shared/voice/hooks'
import { VoicePreviewButtons, VoiceSettingsForm } from '@/shared/voice/VoiceSettingsForm'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PLATFORM_AI_KEY, setPlatformFeature, setVoiceProfile, type PlatformFeature } from './api'

const EMPTY_PROFILE: VoiceProfile = {
  key: '',
  name: '',
  gender: 'female',
  defaultStyle: 'natural',
  pitch: 1,
  lang: 'es-CO',
  provider: 'device',
  deviceVoiceHints: [],
  description: '',
  active: true,
  sortOrder: 0,
}

function ProfileDrawer({ profile, onClose }: { profile: VoiceProfile | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const isNew = profile === null
  const [draft, setDraft] = useState<VoiceProfile>(profile ?? EMPTY_PROFILE)
  const [hints, setHints] = useState((profile?.deviceVoiceHints ?? []).join(', '))
  const keyValid = /^[a-z][a-z0-9_]{1,30}$/.test(draft.key)
  const invalid = !keyValid || draft.name.trim().length < 2 || draft.pitch < 0.5 || draft.pitch > 1.5

  const save = useMutation({
    mutationFn: () => setVoiceProfile({ ...draft, name: draft.name.trim(), deviceVoiceHints: hints.split(',').map((h) => h.trim()).filter(Boolean) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VOICE_PROFILES_KEY })
      await queryClient.invalidateQueries({ queryKey: PLATFORM_AI_KEY })
      show('Voz guardada.')
      onClose()
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar la voz'), 'error'),
  })

  const previewSettings: KitchenVoiceSettings = { profile: draft.key, style: draft.defaultStyle, rate: 1, volume: 1, lang: draft.lang }

  return (
    <Drawer open onClose={onClose} title={isNew ? 'Nueva voz' : draft.name} subtitle="Perfil del catálogo de voces de cocina">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!invalid) save.mutate()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="voice-key" className="text-xs text-neutral-400">
              Clave
            </label>
            <Input id="voice-key" value={draft.key} disabled={!isNew} onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase() })} placeholder="valentina" className="!mt-1" />
            {isNew && draft.key && !keyValid && <p className="mt-1 text-xs text-red-400">Minúsculas, números y guion bajo.</p>}
          </div>
          <div>
            <label htmlFor="voice-name" className="text-xs text-neutral-400">
              Nombre
            </label>
            <Input id="voice-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="!mt-1" />
          </div>
          <div>
            <label htmlFor="voice-gender" className="text-xs text-neutral-400">
              Tipo
            </label>
            <Select id="voice-gender" value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as VoiceGender })} className="!mt-1">
              {(['female', 'male', 'neutral'] as const).map((g) => (
                <option key={g} value={g}>
                  {VOICE_GENDER_LABEL[g]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="voice-style" className="text-xs text-neutral-400">
              Estilo por defecto
            </label>
            <Select id="voice-style" value={draft.defaultStyle} onChange={(e) => setDraft({ ...draft, defaultStyle: e.target.value as VoiceStyle })} className="!mt-1">
              {VOICE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {VOICE_STYLE_META[s].label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="voice-pitch" className="text-xs text-neutral-400">
              Tono (0,5 a 1,5)
            </label>
            <Input id="voice-pitch" type="number" step="0.05" min={0.5} max={1.5} value={draft.pitch} onChange={(e) => setDraft({ ...draft, pitch: Number(e.target.value) })} className="!mt-1" />
          </div>
          <div>
            <label htmlFor="voice-lang-default" className="text-xs text-neutral-400">
              Idioma
            </label>
            <Select id="voice-lang-default" value={draft.lang} onChange={(e) => setDraft({ ...draft, lang: e.target.value as VoiceLang })} className="!mt-1">
              {VOICE_LANGS.map((l) => (
                <option key={l} value={l}>
                  {VOICE_LANG_LABEL[l]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="voice-hints" className="text-xs text-neutral-400">
            Voces del equipo a buscar, en orden
          </label>
          <Textarea id="voice-hints" rows={2} value={hints} onChange={(e) => setHints(e.target.value)} placeholder="Paulina, Salomé, Google español" className="!mt-1" />
          <p className={typography.caption}>Nombres (o parte del nombre) de voces instaladas en tabletas y navegadores. Vacío = la voz predeterminada del equipo.</p>
        </div>
        <div>
          <label htmlFor="voice-description" className="text-xs text-neutral-400">
            Descripción
          </label>
          <Input id="voice-description" value={draft.description} maxLength={200} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="!mt-1" />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 px-3 py-2.5 text-sm text-neutral-300">
          Visible para las organizaciones
          <Switch checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} label="Voz activa" />
        </label>
        {!isNew && <VoicePreviewButtons settings={previewSettings} profiles={[{ ...draft, deviceVoiceHints: hints.split(',').map((h) => h.trim()).filter(Boolean), active: true }]} />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={invalid}>
            Guardar
          </Button>
        </div>
      </form>
    </Drawer>
  )
}

/** Kitchen voice at platform level: default voice and catalog (ADR 0014, 6 and 9). */
export function VoiceCatalogTab({ voiceFeature }: { voiceFeature: PlatformFeature | undefined }) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { data: profiles } = useVoiceProfiles()
  const [editing, setEditing] = useState<VoiceProfile | 'new' | null>(null)
  const saved = toVoiceSettings(voiceFeature?.defaultSettings)
  const [edited, setEdited] = useState<KitchenVoiceSettings | null>(null)
  const form = edited ?? saved

  const saveDefault = useMutation({
    mutationFn: (settings: KitchenVoiceSettings) => setPlatformFeature('voice_speech', { defaultSettings: { ...settings } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLATFORM_AI_KEY })
      setEdited(null)
      show('Voz por defecto de la plataforma guardada.')
    },
    onError: (err) => show(getErrorMessage(err, 'No se pudo guardar'), 'error'),
  })

  const columns: DataTableColumn<VoiceProfile>[] = [
    {
      key: 'name',
      header: 'Voz',
      cell: (p) => (
        <span className="min-w-0">
          <span className="block font-medium text-neutral-100">
            {p.name} {saved.profile === p.key && <Badge tone="brand" size="sm">Por defecto</Badge>}
          </span>
          <span className="block truncate text-xs text-neutral-500">{p.description}</span>
        </span>
      ),
    },
    { key: 'type', header: 'Tipo · estilo', hideBelow: 'md', cell: (p) => <span className="text-xs text-neutral-300">{VOICE_GENDER_LABEL[p.gender]} · {VOICE_STYLE_META[p.defaultStyle].label}</span> },
    { key: 'hints', header: 'Busca en el equipo', hideBelow: 'lg', cell: (p) => <span className="line-clamp-1 text-xs text-neutral-500">{p.deviceVoiceHints.join(', ') || 'Voz predeterminada'}</span> },
    { key: 'active', header: 'Estado', cell: (p) => <Badge tone={p.active ? 'success' : 'neutral'} size="sm" dot>{p.active ? 'Activa' : 'Oculta'}</Badge> },
    {
      key: 'actions',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      cell: (p) => (
        <Button variant="link" size="sm" onClick={() => setEditing(p)}>
          Editar
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <section className="max-w-3xl space-y-4">
        <div>
          <h2 className={typography.h3}>Voz por defecto de la plataforma</h2>
          <p className={typography.caption}>La que usan las organizaciones y cuentas que no eligieron otra. La vista previa suena con las voces de este equipo.</p>
        </div>
        <div className="space-y-4 rounded-2xl border border-neutral-800/60 bg-neutral-900/60 p-5">
          <VoiceSettingsForm value={form} onChange={setEdited} profiles={profiles} disabled={saveDefault.isPending} />
          {edited && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEdited(null)} disabled={saveDefault.isPending}>
                Descartar
              </Button>
              <Button variant="primary" size="sm" loading={saveDefault.isPending} onClick={() => saveDefault.mutate(edited)}>
                Guardar voz por defecto
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className={typography.h3}>Catálogo de voces</h2>
          <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
            Agregar voz
          </Button>
        </div>
        <DataTable columns={columns} rows={profiles} getRowId={(p) => p.key} />
        <p className={typography.caption}>Proveedor: voz del dispositivo (sin costo ni latencia de red). Cada equipo usa la voz instalada que coincide con el perfil; las cuentas pueden fijar una voz por equipo.</p>
      </section>
      {editing && <ProfileDrawer profile={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
