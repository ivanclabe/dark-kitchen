import { useAuth } from '@/shared/hooks/useAuth'
import { useMyContext } from '@/shared/kitchen/activeKitchenContext'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, Flame, LogOut, SearchX } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { currentHost, rootUrl, tenantHostLabel, tenantUrl } from './host'
import { fetchTenantPublic, tenantAccess } from './resolve'
import { TenantContext, useTenant, type TenantValue } from './tenantContext'

/**
 * Resolves the tenant of the page ONCE (ADR 0021/0022): host → organization
 * by its code (public data) → the person's membership in it
 * (dk_my_context). Mounted above the router; the gate (TenantGate) decides
 * what to show.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  const host = useMemo(() => currentHost(), [])
  const code = host.kind === 'tenant' ? host.code : null
  const { session, profile, loading } = useAuth()
  const publicQuery = useQuery({
    queryKey: ['tenant-public', code],
    queryFn: () => fetchTenantPublic(code!),
    enabled: Boolean(code),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const ctxQuery = useMyContext()

  const value = useMemo<TenantValue>(() => {
    const base = { host, mode: host.kind, code, tenant: publicQuery.data ?? null, organization: null, membership: null, accounts: [], retry: () => void publicQuery.refetch() }
    if (!code) return { ...base, status: 'none' }
    if (publicQuery.isLoading || loading) return { ...base, status: 'loading' }
    if (publicQuery.isError || !publicQuery.data) return { ...base, status: 'error' }
    const tenant = publicQuery.data
    // Signed in with an active profile: wait for the memberships before deciding.
    if (session && profile?.active && ctxQuery.isLoading) return { ...base, status: 'loading' }
    const access = tenantAccess(tenant, Boolean(session), ctxQuery.data)
    return {
      ...base,
      status: access.status,
      organization: tenant.exists ? { id: access.membership?.id ?? null, code: tenant.code ?? code, name: tenant.name ?? code } : null,
      membership: access.membership,
      accounts: access.accounts,
    }
  }, [host, code, publicQuery, loading, session, profile?.active, ctxQuery.isLoading, ctxQuery.data])

  return <TenantContext value={value}>{children}</TenantContext>
}

/** Pages anyone can open on a subdomain, before deciding membership. */
const OPEN_PATHS = ['/login', '/activar/', '/set-password', '/registro', '/landing', '/precios']

function Screen({ icon: Icon, title, children }: { icon: typeof Flame; title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="w-full max-w-md space-y-5 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-neutral-900 text-brasa-400">
          <Icon size={22} aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="space-y-4 text-sm text-neutral-400">{children}</div>
      </div>
    </div>
  )
}

const linkClass = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-500 hover:text-neutral-50'

/**
 * The gate of every route (a layout route): on a subdomain, nothing of the
 * app mounts until the organization exists, is active and the person is a
 * member. Without a session, the routes themselves send to the
 * organization's login. Root and path modes pass through.
 */
export function TenantGate() {
  const tenant = useTenant()
  const { pathname } = useLocation()
  const { signOut } = useAuth()
  const { data: ctx } = useMyContext()
  const open = OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(p))

  if (tenant.mode !== 'tenant' || open) return <Outlet />
  const label = tenant.code ? tenantHostLabel(tenant.code) : ''
  const home = rootUrl('/') ?? '/'

  switch (tenant.status) {
    case 'loading':
      return <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">Cargando…</div>
    case 'error':
      return (
        <Screen icon={AlertTriangle} title="No pudimos abrir este espacio">
          <p>Revisa tu conexión e inténtalo de nuevo.</p>
          <button type="button" onClick={tenant.retry} className={linkClass}>
            Reintentar
          </button>
        </Screen>
      )
    case 'not_found':
      return (
        <Screen icon={SearchX} title="Esta dirección no existe">
          <p>
            No hay ningún espacio de Quanela en <span className="font-mono text-neutral-200">{label}</span>. Revisa que la dirección esté bien escrita.
          </p>
          <a href={home} className={linkClass}>
            Ir a Quanela
          </a>
        </Screen>
      )
    case 'inactive':
      return (
        <Screen icon={Building2} title={`${tenant.organization?.name ?? 'Este espacio'} está desactivado`}>
          <p>Por ahora nadie puede entrar. Si crees que es un error, contacta a quien administra tu negocio.</p>
          <a href={home} className={linkClass}>
            Ir a Quanela
          </a>
        </Screen>
      )
    case 'no_access': {
      const others = (ctx?.organizations ?? []).filter((o) => o.status === 'active' && o.active && o.tenantCode !== tenant.code)
      return (
        <Screen icon={AlertTriangle} title={`No tienes acceso a ${tenant.organization?.name ?? label}`}>
          <p>Tu usuario no pertenece a este espacio, o tu acceso todavía no está activo. Pide a su administrador que te agregue al equipo.</p>
          {others.length > 0 && (
            <div className="space-y-2">
              <p className="text-neutral-300">Tus espacios:</p>
              <div className="flex flex-col items-center gap-2">
                {others.map((o) => (
                  <a key={o.id} href={tenantUrl(o.tenantCode, '/') ?? '/'} className={linkClass}>
                    <Flame size={14} className="text-brasa-400" aria-hidden /> {o.name} <span className="font-mono text-xs text-neutral-500">{o.tenantCode}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={() => void signOut()} className={linkClass}>
            <LogOut size={14} aria-hidden /> Entrar con otro usuario
          </button>
        </Screen>
      )
    }
    default:
      return <Outlet />
  }
}
