import { Avatar } from '@/shared/avatars/Avatar'
import { onlineLabel } from '@/shared/presence/presence'
import { useAccountPresence } from '@/shared/presence/useAccountPresence'
import { Popover } from '@/shared/ui/Popover'
import clsx from 'clsx'

/**
 * «3 en línea» in the header (ADR 0050): the people of the business who have
 * this account open right now. Opens the list: avatar, name, role, and who
 * is away. Never what anyone is doing.
 */
export function OnlineIndicator({ compact = false, placement = 'bottom-end' }: { compact?: boolean; placement?: 'bottom-end' | 'bottom-start' }) {
  const { people, connected } = useAccountPresence()
  const label = connected ? onlineLabel(people) : 'Sin conexión en vivo'
  const count = Math.max(1, people.length)

  return (
    <Popover
      placement={placement}
      label="Quién está en línea"
      className="md:w-72"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={connected ? `${label}. Ver quién` : label}
          title={label}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100',
            compact && 'px-2',
          )}
        >
          <span className="relative flex size-2" aria-hidden>
            {connected && people.length > 1 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />}
            <span className={clsx('relative inline-flex size-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-neutral-600')} />
          </span>
          {compact ? <span className="tabular-nums">{connected ? count : '–'}</span> : <span className="whitespace-nowrap">{label}</span>}
        </button>
      )}
    >
      {() => (
        <div className="p-1">
          <p className="px-2.5 pt-1.5 pb-2 text-xs font-medium text-neutral-400">
            {connected ? (people.length <= 1 ? 'Solo tú tienes abierta esta cuenta' : `${people.length} personas con esta cuenta abierta`) : 'Sin conexión en vivo: reintentando…'}
          </p>
          <ul className="max-h-80 space-y-0.5 overflow-y-auto">
            {people.map((p) => (
              <li key={p.userId} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
                <span className="relative">
                  <Avatar avatarKey={p.avatarKey} seed={p.userId} size="sm" className={p.status === 'away' ? 'opacity-50' : undefined} />
                  <span
                    className={clsx('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-neutral-900', p.status === 'active' ? 'bg-emerald-400' : 'bg-neutral-500')}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block truncate text-sm', p.status === 'active' ? 'text-neutral-100' : 'text-neutral-400')}>
                    {p.name}
                    {p.isMe && <span className="text-neutral-500"> (tú)</span>}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {p.roleName}
                    {p.status === 'away' && ' · ausente'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-neutral-800/60 px-2.5 pt-2 pb-1.5 text-[11px] text-neutral-500">Solo se ve quién está en línea, nunca qué hace.</p>
        </div>
      )}
    </Popover>
  )
}
