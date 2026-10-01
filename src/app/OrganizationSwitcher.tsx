import { useMyContext } from '@/shared/kitchen/activeKitchenContext'
import { tenantHostLabel } from '@/shared/tenant/host'
import { goToOrganization } from '@/shared/tenant/navigation'
import clsx from 'clsx'
import { Building2, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * Cambiar de organización (ADR 0021/0022): elegir otra lleva a su subdominio
 * ({código}.quanela.com) — el cambio se ve en la dirección, no es un id en
 * memoria. Sin dominio raíz configurado (vistas previas), "Tus cuentas".
 */
export function OrganizationList({ currentId, onDone }: { currentId: string | null; onDone: () => void }) {
  const { data: ctx } = useMyContext()
  const navigate = useNavigate()
  const organizations = (ctx?.organizations ?? []).filter((o) => o.status === 'active' && (o.active || ctx?.profile.isPlatformAdmin))

  return (
    <ul className="max-h-80 space-y-0.5 overflow-y-auto">
      {organizations.map((o) => {
        const current = o.id === currentId
        return (
          <li key={o.id}>
            <button
              type="button"
              role="menuitem"
              aria-current={current ? 'true' : undefined}
              onClick={() => {
                onDone()
                if (current) return
                if (!goToOrganization(o.tenantCode, '/')) navigate('/cuentas')
              }}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none',
                current ? 'bg-brasa-500/10' : 'hover:bg-neutral-800 focus-visible:bg-neutral-800',
              )}
            >
              <Building2 size={16} className="shrink-0 text-neutral-400" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-100">{o.name}</span>
                <span className="block truncate font-mono text-[11px] text-neutral-500">
                  {o.tenantCode} · {tenantHostLabel(o.tenantCode)}
                </span>
              </span>
              {current && <Check size={16} className="shrink-0 text-brasa-400" aria-label="Organización actual" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
