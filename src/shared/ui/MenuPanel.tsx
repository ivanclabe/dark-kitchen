import clsx from 'clsx'
import { Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Icon = ComponentType<{ size?: number; className?: string }>

interface BaseItem {
  id: string
  label: ReactNode
  icon?: Icon
  /** Second line, smaller (e.g. "Organización · rol"). */
  hint?: ReactNode
  disabled?: boolean
}

/** A menu described as data, so the same tree renders as side flyouts (desktop) or drill-in (phone). */
export type MenuNode =
  | ({ kind: 'item'; onSelect: () => void; checked?: boolean; tone?: 'danger'; external?: boolean; keepOpen?: boolean } & BaseItem)
  | ({ kind: 'submenu'; children: MenuNode[] } & BaseItem)
  | { kind: 'separator'; id: string }
  | { kind: 'section'; id: string; label: ReactNode }
  | { kind: 'custom'; id: string; render: () => ReactNode }

type Placement = 'bottom-end' | 'right-end'

const ITEM = '[data-menu-item]:not([disabled])'
const PANEL_WIDTH = 288

function useIsPhone() {
  const query = '(max-width: 767px)'
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const onChange = () => setPhone(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return phone
}

/** Items of THIS panel only (not of the flyouts opened from it). */
function panelItems(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return []
  return [...panel.querySelectorAll<HTMLElement>(ITEM)].filter((el) => el.closest('[role="menu"]') === panel)
}

function focusFirst(panel: HTMLElement | null) {
  panelItems(panel)[0]?.focus({ preventScroll: true })
}

/**
 * The user menu pattern (ADR 0023): a panel anchored to a button, whose
 * items can open SUBMENUS — to the side on a desktop (portal, fixed, kept on
 * screen), inside the same sheet on a phone ("‹ Volver"). Keyboard: ↑/↓ move,
 * → or Enter opens a submenu, ← goes back, Esc closes everything and returns
 * focus to the button. Outside click closes.
 */
export function MenuPanel({
  trigger,
  label,
  placement = 'bottom-end',
  header,
  items,
}: {
  trigger: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string }) => ReactNode
  label: string
  placement?: Placement
  header?: ReactNode
  items: MenuNode[]
}) {
  const [open, setOpen] = useState(false)
  // Ids of the open submenus, by level ([] = only the root).
  const [path, setPath] = useState<string[]>([])
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const phone = useIsPhone()

  const close = useCallback(() => {
    setOpen(false)
    setPath([])
    document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(id)}"]`)?.focus({ preventScroll: true })
  }, [id])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement
      if (rootRef.current?.contains(target) || target.closest?.(`[data-menu-owner="${CSS.escape(id)}"]`)) return
      setOpen(false)
      setPath([])
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, id])

  // Focus: the first item of the deepest open panel (phone: the visible one).
  useEffect(() => {
    if (!open) return
    const level = path.length
    const panel = level === 0 || phone ? panelRef.current : document.querySelector<HTMLElement>(`[data-menu-owner="${CSS.escape(id)}"][data-menu-level="${level}"]`)
    focusFirst(panel)
  }, [open, path.length, phone, id])

  function select(node: Extract<MenuNode, { kind: 'item' }>) {
    if (node.disabled) return
    node.onSelect()
    if (!node.keepOpen) {
      setOpen(false)
      setPath([])
    }
  }

  function openSubmenu(level: number, nodeId: string) {
    setPath((p) => [...p.slice(0, level), nodeId])
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>, level: number) {
    const panel = e.currentTarget
    const list = panelItems(panel)
    const index = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      list[(index + 1) % list.length]?.focus({ preventScroll: true })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      list[(index - 1 + list.length) % list.length]?.focus({ preventScroll: true })
    } else if (e.key === 'ArrowRight') {
      const nodeId = (document.activeElement as HTMLElement | null)?.dataset.submenu
      if (nodeId) {
        e.preventDefault()
        openSubmenu(level, nodeId)
      }
    } else if (e.key === 'ArrowLeft' && level > 0) {
      e.preventDefault()
      e.stopPropagation()
      const parentId = path[level - 1]
      setPath((p) => p.slice(0, level - 1))
      // Back to the item that opened it.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-menu-owner-item="${CSS.escape(id)}"][data-submenu="${CSS.escape(parentId)}"]`)?.focus({ preventScroll: true }))
    } else if (e.key === 'Tab') {
      setOpen(false)
      setPath([])
    }
  }

  // The node list shown at each level.
  const levels: { nodes: MenuNode[]; title?: ReactNode }[] = [{ nodes: items }]
  for (const nodeId of path) {
    const parent = levels[levels.length - 1].nodes.find((n) => n.id === nodeId)
    if (!parent || parent.kind !== 'submenu') break
    levels.push({ nodes: parent.children, title: parent.label })
  }

  function renderNodes(nodes: MenuNode[], level: number) {
    return nodes.map((node) => {
      switch (node.kind) {
        case 'separator':
          return <div key={node.id} role="separator" className="my-1.5 h-px bg-neutral-800" />
        case 'section':
          return (
            <p key={node.id} className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
              {node.label}
            </p>
          )
        case 'custom':
          return <div key={node.id}>{node.render()}</div>
        case 'submenu': {
          const expanded = path[level] === node.id
          return (
            <button
              key={node.id}
              type="button"
              role="menuitem"
              data-menu-item=""
              data-submenu={node.id}
              data-menu-owner-item={id}
              aria-haspopup="menu"
              aria-expanded={expanded}
              disabled={node.disabled}
              onClick={() => (expanded && !phone ? setPath((p) => p.slice(0, level)) : openSubmenu(level, node.id))}
              onMouseEnter={() => !phone && openSubmenu(level, node.id)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 transition-colors focus-visible:outline-none disabled:opacity-40',
                expanded ? 'bg-neutral-800' : 'hover:bg-neutral-800 focus-visible:bg-neutral-800',
              )}
            >
              {node.icon && <node.icon size={16} className="shrink-0 text-neutral-400" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{node.label}</span>
                {node.hint && <span className="block truncate text-xs text-neutral-500">{node.hint}</span>}
              </span>
              <ChevronRight size={15} className="shrink-0 text-neutral-500" aria-hidden />
            </button>
          )
        }
        case 'item':
          return (
            <button
              key={node.id}
              type="button"
              role={node.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={node.checked}
              data-menu-item=""
              disabled={node.disabled}
              onClick={() => select(node)}
              // On a desktop, hovering a plain item closes the submenus opened at this level.
              onMouseEnter={() => !phone && path.length > level && setPath((p) => p.slice(0, level))}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none disabled:opacity-40',
                node.tone === 'danger' ? 'text-red-300 hover:bg-red-500/10 focus-visible:bg-red-500/10' : 'text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800',
              )}
            >
              {node.icon && <node.icon size={16} className={clsx('shrink-0', node.tone === 'danger' ? 'text-red-400' : 'text-neutral-400')} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{node.label}</span>
                {node.hint && <span className="block truncate text-xs text-neutral-500">{node.hint}</span>}
              </span>
              {node.external && <ExternalLink size={14} className="shrink-0 text-neutral-500" aria-hidden />}
              {node.checked && <Check size={16} className="shrink-0 text-brasa-400" aria-hidden />}
            </button>
          )
      }
    })
  }

  const deepest = levels[levels.length - 1]
  const flyoutSide = placement === 'right-end' ? 'right' : 'left'

  return (
    <div ref={rootRef} className="relative">
      {trigger({ onClick: () => (open ? close() : setOpen(true)), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': id })}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" aria-hidden onClick={close} />
          <div
            ref={panelRef}
            id={id}
            role="menu"
            aria-label={label}
            data-menu-level={0}
            onKeyDown={(e) => onKeyDown(e, phone ? levels.length - 1 : 0)}
            className={clsx(
              'shadow-float z-50 border border-neutral-800 bg-neutral-900 p-2 text-neutral-100',
              'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[85vh] max-md:overflow-y-auto max-md:rounded-t-2xl max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]',
              'md:absolute md:w-72 md:rounded-2xl',
              placement === 'right-end' ? 'md:bottom-0 md:left-full md:ml-3' : 'md:top-full md:right-0 md:mt-2',
            )}
          >
            {phone && levels.length > 1 ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  data-menu-item=""
                  onClick={() => setPath((p) => p.slice(0, -1))}
                  className="mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-neutral-300 hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none"
                >
                  <ChevronLeft size={16} aria-hidden /> {deepest.title}
                </button>
                {renderNodes(deepest.nodes, levels.length - 1)}
              </>
            ) : (
              <>
                {header}
                {renderNodes(items, 0)}
              </>
            )}
          </div>
          {!phone &&
            levels.slice(1).map((lvl, i) => (
              <Flyout key={path[i]} owner={id} level={i + 1} anchorId={path[i]} side={flyoutSide} label={typeof lvl.title === 'string' ? lvl.title : label} onKeyDown={(e) => onKeyDown(e, i + 1)}>
                {renderNodes(lvl.nodes, i + 1)}
              </Flyout>
            ))}
        </>
      )}
    </div>
  )
}

/** A side submenu: fixed, next to the item that opened it, shifted to stay on screen. */
function Flyout({
  owner,
  level,
  anchorId,
  side,
  label,
  onKeyDown,
  children,
}: {
  owner: string
  level: number
  anchorId: string
  side: 'left' | 'right'
  label: string
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const anchor = document.querySelector<HTMLElement>(`[data-menu-owner-item="${CSS.escape(owner)}"][data-submenu="${CSS.escape(anchorId)}"]`)
    const panel = anchor?.closest<HTMLElement>('[role="menu"]')
    if (!el || !anchor || !panel) return
    const a = anchor.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    const gap = 8
    let left = side === 'right' ? p.right + gap : p.left - gap - PANEL_WIDTH
    if (left + PANEL_WIDTH > window.innerWidth - gap) left = p.left - gap - PANEL_WIDTH
    if (left < gap) left = Math.min(p.right + gap, window.innerWidth - gap - PANEL_WIDTH)
    let top = a.top - 8
    const height = el.offsetHeight
    if (top + height > window.innerHeight - gap) top = Math.max(gap, window.innerHeight - gap - height)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.visibility = 'visible'
  })
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      data-menu-owner={owner}
      data-menu-level={level}
      onKeyDown={onKeyDown}
      style={{ width: PANEL_WIDTH, visibility: 'hidden' }}
      className="shadow-float fixed z-50 max-h-[80vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-2 text-neutral-100"
    >
      {children}
    </div>,
    document.body,
  )
}
