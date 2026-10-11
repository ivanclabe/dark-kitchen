import { IconButton } from '@/shared/ui/Button'
import clsx from 'clsx'
import { Monitor, Smartphone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ResolvedTheme } from '../../lib/themes'
import { useWidth } from '../../lib/useWidth'
import { PublicMenuView } from '../../public/MenuView'
import { ThemeRoot } from '../../public/ThemeRoot'
import type { PublicMenu } from '../../types'

/**
 * The live preview (ADR 0053, D5): the same page customers see, drawn with
 * the design being edited, in a phone or desktop frame. The cart works;
 * nothing is ever sent from here.
 */
export function DesignPreview({ theme, menu, sample }: { theme: ResolvedTheme; menu: PublicMenu; sample: boolean }) {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">{sample ? 'Platos de ejemplo: hoy no hay menú en el planificador.' : 'Tu menú de hoy, como lo verán tus clientes.'}</p>
        <div className="flex gap-1" role="group" aria-label="Tamaño de la vista previa">
          <IconButton icon={Smartphone} size="sm" variant="ghost" active={device === 'mobile'} aria-pressed={device === 'mobile'} aria-label="Celular" onClick={() => setDevice('mobile')} />
          <IconButton icon={Monitor} size="sm" variant="ghost" active={device === 'desktop'} aria-pressed={device === 'desktop'} aria-label="Escritorio" onClick={() => setDevice('desktop')} />
        </div>
      </div>
      <div className="flex justify-center">
        <div
          data-testid="design-preview"
          className={clsx(
            'overflow-hidden bg-neutral-900 shadow-2xl',
            device === 'mobile' ? 'h-[720px] w-[375px] max-w-full rounded-[2.25rem] border-[10px] border-neutral-800' : 'aspect-[4/3] w-full rounded-xl border border-neutral-800',
          )}
        >
          {device === 'desktop' && (
            <div className="flex h-7 items-center gap-1.5 border-b border-neutral-800 px-3" aria-hidden>
              <span className="size-2.5 rounded-full bg-neutral-700" />
              <span className="size-2.5 rounded-full bg-neutral-700" />
              <span className="size-2.5 rounded-full bg-neutral-700" />
            </div>
          )}
          {device === 'desktop' ? (
            <DesktopCanvas>
              <ThemeRoot theme={theme} contained>
                <PublicMenuView slug={menu.business.slug} menu={menu} theme={theme} mode="preview" />
              </ThemeRoot>
            </DesktopCanvas>
          ) : (
            <ThemeRoot theme={theme} contained>
              <PublicMenuView slug={menu.business.slug} menu={menu} theme={theme} mode="preview" />
            </ThemeRoot>
          )}
        </div>
      </div>
    </div>
  )
}

const DESKTOP_WIDTH = 1024

/** A real desktop width (1024 px), scaled down to fit the column: the page lays out as on a computer. */
function DesktopCanvas({ children }: { children: ReactNode }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const scale = width ? Math.min(1, width / DESKTOP_WIDTH) : 0.5
  return (
    <div ref={ref} className="relative h-[calc(100%-1.75rem)] overflow-hidden">
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: DESKTOP_WIDTH, height: `${100 / scale}%`, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}
