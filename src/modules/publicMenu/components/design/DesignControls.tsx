import { ACCEPT_ATTRIBUTE, imageFileProblem, productImageUrl } from '@/modules/products/lib/productImages'
import { Accordion } from '@/shared/ui/Accordion'
import { Button } from '@/shared/ui/Button'
import { Chip } from '@/shared/ui/Chip'
import { FormField, Select } from '@/shared/ui/FormField'
import { Switch } from '@/shared/ui/Switch'
import { getErrorMessage } from '@/shared/utils/errors'
import { AlertTriangle, ImagePlus, Trash2, Wand2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { contrastIssues, FONTS, fixContrast, PALETTES, type ResolvedTheme, type ThemeColors } from '../../lib/themes'

type Set = (update: (theme: ResolvedTheme) => ResolvedTheme) => void

function Options<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-xs font-medium text-neutral-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o.value} label={o.label} active={value === o.value} onClick={() => onChange(o.value)} />
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-neutral-300">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

const COLOR_LABEL: Record<keyof ThemeColors, string> = {
  primary: 'Principal (botones)',
  background: 'Fondo',
  surface: 'Tarjetas',
  text: 'Texto',
  muted: 'Texto secundario',
  price: 'Precio',
}

function ColorField({ name, value, onChange }: { name: keyof ThemeColors; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  // Keep the text box in step when the color changes from outside (palette, template, «Corregir»).
  if (shown !== value) {
    setShown(value)
    setText(value)
  }
  return (
    <label className="flex items-center gap-2 rounded-lg border border-neutral-800 px-2 py-1.5">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={COLOR_LABEL[name]} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-neutral-400">{COLOR_LABEL[name]}</span>
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value.trim()
            setText(v)
            if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v.toUpperCase())
          }}
          spellCheck={false}
          maxLength={7}
          aria-label={`${COLOR_LABEL[name]} en hexadecimal`}
          className="w-full bg-transparent font-mono text-xs text-neutral-100 outline-none"
        />
      </span>
    </label>
  )
}

/** A cover or background photo of the brand: upload (shrunk in the browser), see and remove. */
function BrandImage({ label, path, onUpload, onRemove }: { label: string; path: string | null; onUpload: (file: File) => Promise<void>; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    const problem = imageFileProblem(file)
    if (problem) return setError(problem)
    setError(null)
    setBusy(true)
    try {
      await onUpload(file)
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo subir la foto'))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      {path && <img src={productImageUrl(path)} alt="" className="h-24 w-full rounded-lg object-cover" />}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy} onClick={() => input.current?.click()}>
          {path ? 'Cambiar foto' : 'Subir foto'}
        </Button>
        {path && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove}>
            Quitar
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} tabIndex={-1} aria-hidden />
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

function Group({ title, summary, defaultOpen, children }: { title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <Accordion title={title} summary={summary} defaultOpen={defaultOpen}>
      <div className="space-y-4">{children}</div>
    </Accordion>
  )
}

const LABELS = {
  scale: { S: 'Pequeña', M: 'Normal', L: 'Grande' },
  kind: { solid: 'Color', gradient: 'Degradado', texture: 'Textura', image: 'Foto' },
  texture: { paper: 'Papel', dots: 'Puntos', lines: 'Líneas' },
  header: { compact: 'Compacta', centered: 'Centrada', cover: 'Con portada', logo: 'Logo grande' },
  layout: { list: 'Lista', grid: 'Cuadrícula', large: 'Foto grande', compact: 'Compacta', carousel: 'Carrusel', menu: 'Carta' },
  style: { flat: 'Plana', shadow: 'Con sombra', outline: 'Borde', rough: 'Artesanal', glass: 'Translúcida' },
  shape: { square: 'Cuadrada', rounded: 'Redondeada', circle: 'Circular' },
  position: { left: 'Izquierda', right: 'Derecha', top: 'Arriba' },
  description: { full: 'Completa', clamp: '2 líneas', hide: 'Oculta' },
  nav: { chips: 'Chips', tabs: 'Pestañas', select: 'Desplegable', none: 'Sin barra' },
  buttons: { rounded: 'Redondeados', pill: 'Píldora', square: 'Rectos' },
} as const

const options = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))

/**
 * The appearance editor (ADR 0053, D4): one section per part of the page.
 * Every change goes straight to the preview; prices and dishes are not here.
 */
export function DesignControls({ theme, set, onUpload }: { theme: ResolvedTheme; set: Set; onUpload: (file: File, kind: 'cover' | 'background') => Promise<string> }) {
  const issues = contrastIssues(theme)
  const setColors = (colors: Partial<ThemeColors>) => set((t) => ({ ...t, colors: { ...t.colors, ...colors } }))
  const setFonts = (fonts: Partial<ResolvedTheme['fonts']>) => set((t) => ({ ...t, fonts: { ...t.fonts, ...fonts } }))
  const setBackground = (background: Partial<ResolvedTheme['background']>) => set((t) => ({ ...t, background: { ...t.background, ...background } }))
  const setHeader = (header: Partial<ResolvedTheme['header']>) => set((t) => ({ ...t, header: { ...t.header, ...header } }))
  const setCards = (cards: Partial<ResolvedTheme['cards']>) => set((t) => ({ ...t, cards: { ...t.cards, ...cards } }))

  return (
    <div className="space-y-2">
      <Group title="Colores" summary={issues.length ? 'Revisa el contraste' : undefined} defaultOpen>
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutral-400">Paletas sugeridas</p>
          <div className="flex flex-wrap gap-2">
            {PALETTES.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setColors(p.colors)}
                title={p.name}
                className="flex items-center gap-1.5 rounded-full border border-neutral-800 py-1 pr-2.5 pl-1 text-xs text-neutral-300 hover:border-neutral-600"
              >
                <span className="flex -space-x-1" aria-hidden>
                  {[p.colors.background, p.colors.primary, p.colors.text].map((c, i) => (
                    <span key={i} className="size-4 rounded-full ring-1 ring-neutral-700" style={{ background: c }} />
                  ))}
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(COLOR_LABEL) as (keyof ThemeColors)[]).map((k) => (
            <ColorField key={k} name={k} value={theme.colors[k]} onChange={(v) => setColors({ [k]: v })} />
          ))}
        </div>
        {issues.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            {issues.map((i) => (
              <li key={i.pair} className="flex items-center gap-2">
                <AlertTriangle size={13} className="shrink-0" aria-hidden />
                <span className="flex-1">
                  {i.label} se lee con dificultad (contraste {i.ratio.toFixed(1)}:1; lo recomendado es 4.5:1).
                </span>
                <Button size="sm" variant="secondary" icon={Wand2} onClick={() => set((t) => fixContrast(t, i.pair))}>
                  Corregir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Group>

      <Group title="Tipografía" summary={`${theme.fonts.heading} · ${theme.fonts.body}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Títulos">
            {(a11y) => (
              <Select {...a11y} value={theme.fonts.heading} onChange={(e) => setFonts({ heading: e.target.value as ResolvedTheme['fonts']['heading'] })}>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Texto">
            {(a11y) => (
              <Select {...a11y} value={theme.fonts.body} onChange={(e) => setFonts({ body: e.target.value as ResolvedTheme['fonts']['body'] })}>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <Options label="Tamaño de la letra" value={theme.fonts.scale} options={options(LABELS.scale)} onChange={(scale) => setFonts({ scale })} />
      </Group>

      <Group title="Fondo" summary={LABELS.kind[theme.background.kind]}>
        <Options label="Tipo de fondo" value={theme.background.kind} options={options(LABELS.kind)} onChange={(kind) => setBackground({ kind })} />
        {theme.background.kind === 'texture' && <Options label="Textura" value={theme.background.texture} options={options(LABELS.texture)} onChange={(texture) => setBackground({ texture })} />}
        {theme.background.kind === 'image' && (
          <BrandImage
            label="Foto de fondo (se aclara para que el menú se lea)"
            path={theme.background.image}
            onUpload={async (file) => setBackground({ image: await onUpload(file, 'background') })}
            onRemove={() => setBackground({ image: null })}
          />
        )}
      </Group>

      <Group title="Cabecera" summary={LABELS.header[theme.header.style]}>
        <Options label="Estilo" value={theme.header.style} options={options(LABELS.header)} onChange={(style) => setHeader({ style })} />
        {theme.header.style === 'cover' && (
          <BrandImage
            label="Portada (sin foto, un degradado con tu color principal)"
            path={theme.header.cover}
            onUpload={async (file) => setHeader({ cover: await onUpload(file, 'cover') })}
            onRemove={() => setHeader({ cover: null })}
          />
        )}
        <Toggle label="Mostrar la frase del negocio" checked={theme.header.showTagline} onChange={(showTagline) => setHeader({ showTagline })} />
        <Toggle label="Mostrar si está abierto" checked={theme.header.showHours} onChange={(showHours) => setHeader({ showHours })} />
      </Group>

      <Group title="Platos" summary={`${LABELS.layout[theme.cards.layout]} · ${LABELS.style[theme.cards.style]}`}>
        <Options label="Cómo se ven" value={theme.cards.layout} options={options(LABELS.layout)} onChange={(layout) => setCards({ layout })} />
        {theme.cards.layout !== 'menu' && <Options label="Tarjeta" value={theme.cards.style} options={options(LABELS.style)} onChange={(style) => setCards({ style })} />}
        {theme.cards.layout !== 'menu' && theme.cards.layout !== 'compact' && (
          <>
            <Toggle label="Mostrar fotos" checked={theme.cards.image === 'show'} onChange={(v) => setCards({ image: v ? 'show' : 'hide' })} />
            {theme.cards.image === 'show' && (
              <>
                <Options label="Forma de la foto" value={theme.cards.imageShape} options={options(LABELS.shape)} onChange={(imageShape) => setCards({ imageShape })} />
                {theme.cards.layout === 'list' && (
                  <Options label="Posición de la foto" value={theme.cards.imagePosition} options={options(LABELS.position)} onChange={(imagePosition) => setCards({ imagePosition })} />
                )}
              </>
            )}
          </>
        )}
        <Options label="Descripción" value={theme.cards.description} options={options(LABELS.description)} onChange={(description) => setCards({ description })} />
      </Group>

      <Group title="Navegación" summary={LABELS.nav[theme.nav]}>
        <Options label="Barra de categorías" value={theme.nav} options={options(LABELS.nav)} onChange={(nav) => set((t) => ({ ...t, nav }))} />
      </Group>

      <Group title="Botones" summary={LABELS.buttons[theme.buttons]}>
        <Options label="Forma" value={theme.buttons} options={options(LABELS.buttons)} onChange={(buttons) => set((t) => ({ ...t, buttons }))} />
      </Group>
    </div>
  )
}
