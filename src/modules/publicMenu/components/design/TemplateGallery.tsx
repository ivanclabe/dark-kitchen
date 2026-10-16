import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useWidth } from '../../lib/useWidth'
import { TEMPLATE_IDS, TEMPLATES, type ResolvedTheme, type TemplateId } from '../../lib/themes'
import { PublicMenuView } from '../../public/MenuView'
import { ThemeRoot } from '../../public/ThemeRoot'
import type { PublicMenu } from '../../types'

const PHONE_WIDTH = 390

/** A real, scaled-down render of the public page with a theme (not a drawing): what you see is what you get. */
export function ThemeThumbnail({ theme, menu, height = 190 }: { theme: ResolvedTheme; menu: PublicMenu; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const scale = width ? width / PHONE_WIDTH : 0.4
  return (
    <div ref={ref} className="relative overflow-hidden" style={{ height }} aria-hidden inert>
      <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ width: PHONE_WIDTH, height: height / scale, transform: `scale(${scale})` }}>
        <ThemeRoot theme={theme} contained>
          <PublicMenuView slug={menu.business.slug} menu={menu} theme={theme} mode="preview" />
        </ThemeRoot>
      </div>
    </div>
  )
}

/** The six templates (ADR 0053, D3), each drawn with the account's own menu. */
export function TemplateGallery({ menu, value, onPick }: { menu: PublicMenu; value: TemplateId; onPick: (id: TemplateId) => void }) {
  const mini = { ...menu, items: menu.items.slice(0, 4), business: { ...menu.business, message: null } }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {TEMPLATE_IDS.map((id) => {
        const def = TEMPLATES[id]
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            aria-pressed={active}
            className={clsx(
              'group relative overflow-hidden rounded-xl border text-left transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
              active ? 'border-brasa-500 ring-2 ring-brasa-500/40' : 'border-neutral-800 hover:border-neutral-600',
            )}
          >
            <ThemeThumbnail theme={def.theme} menu={mini} />
            {active && (
              <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-on-primary shadow" aria-hidden>
                <Check size={14} />
              </span>
            )}
            <span className="block border-t border-neutral-800 bg-neutral-950 px-3 py-2">
              <span className="block text-sm font-medium text-neutral-100">{def.name}</span>
              <span className="line-clamp-2 block text-xs text-neutral-500">{def.description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
