import { useCopilot } from '@/modules/copilot/copilotContext'
import { useAppearance } from '@/shared/appearance/appearance'
import { Avatar } from '@/shared/avatars/Avatar'
import { useAuth } from '@/shared/hooks/useAuth'
import { useActiveKitchen, useMyContext, useMyKitchens } from '@/shared/kitchen/activeKitchenContext'
import type { MyOrganization } from '@/shared/kitchen/kitchensApi'
import { canOpenAdminCenter, orgPath, useOrgAdmin } from '@/shared/org/orgContext'
import { canAccessModule } from '@/shared/rbac/roles'
import { tenantHostLabel } from '@/shared/tenant/host'
import { goToOrganization } from '@/shared/tenant/navigation'
import { MenuPanel, type MenuNode } from '@/shared/ui/MenuPanel'
import { useToast } from '@/shared/ui/Toast'
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  CircleHelp,
  Clock3,
  Contrast,
  FileWarning,
  Info,
  Keyboard,
  LayoutList,
  LifeBuoy,
  LogOut,
  Mail,
  MessageCircle,
  Settings,
  Sparkles,
  Store,
  UserRound,
  Users,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSwitchAccount } from './AccountSwitcher'
import { roleSummary } from './roleSummary'
import { KeyboardShortcutsDialog, ReportProblemDialog, SessionDetailsDialog } from './help/HelpDialogs'
import { appVersion, diagnostics, helpCenterUrl, supportEmail, supportWhatsAppUrl } from './help/support'

type Dialog = 'shortcuts' | 'report' | 'session' | null

interface SessionInfo {
  organization: { name: string; code: string } | null
  account: { name: string; slug: string } | null
  role: string | null
  permissionCount: number | null
}

function Header() {
  const { profile, user } = useAuth()
  return (
    <div className="flex items-center gap-3 px-2 pt-1 pb-3">
      <Avatar avatarKey={profile?.avatarKey} seed={profile?.id} size="md" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-neutral-50">{profile?.fullName ?? '—'}</p>
        <p className="truncate text-xs text-neutral-500">{user?.email}</p>
      </div>
    </div>
  )
}

/** "Cambiar de organización": the subdomain changes for real (ADR 0021/0022). */
function organizationNodes(organizations: MyOrganization[], currentId: string | null, fallback: () => void): MenuNode[] {
  return organizations.map((o) => ({
    kind: 'item',
    id: `org-${o.id}`,
    label: o.name,
    hint: `${o.tenantCode} · ${tenantHostLabel(o.tenantCode)}`,
    icon: Building2,
    checked: o.id === currentId,
    onSelect: () => {
      if (o.id !== currentId && !goToOrganization(o.tenantCode, '/')) fallback()
    },
  }))
}

/**
 * What both menus share (account and administration center): Apariencia,
 * Ayuda y soporte, Detalles de la sesión and Cerrar sesión — plus the
 * windows they open, which live outside the menu (it closes on select).
 */
function useCommonMenu(session: SessionInfo) {
  const { profile, user, session: authSession, signOut } = useAuth()
  const [appearance, setAppearance] = useAppearance()
  const copilot = useCopilot()
  const { pathname } = useLocation()
  const [dialog, setDialog] = useState<Dialog>(null)

  const email = supportEmail()
  const whatsapp = supportWhatsAppUrl()
  const helpUrl = helpCenterUrl()
  const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

  const nodes: MenuNode[] = [
    {
      kind: 'submenu',
      id: 'appearance',
      label: 'Apariencia',
      icon: Contrast,
      children: [
        { kind: 'section', id: 'theme', label: 'Tema' },
        { kind: 'item', id: 'theme-dark', label: 'Oscuro', checked: appearance.theme === 'dark', keepOpen: true, onSelect: () => setAppearance({ theme: 'dark' }) },
        { kind: 'item', id: 'theme-light', label: 'Claro (beta)', checked: appearance.theme === 'light', keepOpen: true, onSelect: () => setAppearance({ theme: 'light' }) },
        { kind: 'item', id: 'theme-system', label: 'Según el sistema', checked: appearance.theme === 'system', keepOpen: true, onSelect: () => setAppearance({ theme: 'system' }) },
        { kind: 'separator', id: 'appearance-sep' },
        { kind: 'section', id: 'text', label: 'Tamaño del texto' },
        { kind: 'item', id: 'text-normal', label: 'Normal', checked: appearance.textSize === 'normal', keepOpen: true, onSelect: () => setAppearance({ textSize: 'normal' }) },
        { kind: 'item', id: 'text-large', label: 'Grande', checked: appearance.textSize === 'large', keepOpen: true, onSelect: () => setAppearance({ textSize: 'large' }) },
        { kind: 'custom', id: 'appearance-note', render: () => <p className="px-3 pt-1 pb-1.5 text-[11px] text-neutral-500">Se guarda en este equipo.</p> },
      ],
    },
    {
      kind: 'submenu',
      id: 'help',
      label: 'Ayuda y soporte',
      icon: LifeBuoy,
      children: [
        { kind: 'item', id: 'shortcuts', label: 'Atajos de teclado', icon: Keyboard, onSelect: () => setDialog('shortcuts') },
        ...(copilot.available ? [{ kind: 'item' as const, id: 'ask-copilot', label: 'Preguntar a Copilot', hint: 'Ctrl/⌘ + J', icon: Sparkles, onSelect: copilot.open }] : []),
        { kind: 'item', id: 'report', label: 'Reportar un problema', icon: FileWarning, onSelect: () => setDialog('report') },
        ...(email || whatsapp || helpUrl ? [{ kind: 'separator' as const, id: 'help-sep' }] : []),
        ...(email ? [{ kind: 'item' as const, id: 'support-mail', label: 'Escribir a soporte', hint: email, icon: Mail, external: true, onSelect: () => open(`mailto:${email}`) }] : []),
        ...(whatsapp ? [{ kind: 'item' as const, id: 'support-wa', label: 'Soporte por WhatsApp', icon: MessageCircle, external: true, onSelect: () => open(whatsapp) }] : []),
        ...(helpUrl ? [{ kind: 'item' as const, id: 'help-center', label: 'Centro de ayuda', icon: CircleHelp, external: true, onSelect: () => open(helpUrl) }] : []),
      ],
    },
    { kind: 'separator', id: 'end-sep' },
    { kind: 'item', id: 'session', label: 'Detalles de la sesión', icon: Clock3, onSelect: () => setDialog('session') },
    { kind: 'item', id: 'sign-out', label: 'Cerrar sesión', icon: LogOut, tone: 'danger', onSelect: () => void signOut() },
  ]

  const rows = diagnostics({
    userName: profile?.fullName ?? null,
    email: user?.email ?? null,
    ...session,
    // The path only: queries may carry one-time tokens (activation links).
    screen: pathname,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    version: appVersion(),
    signedInAt: authSession?.user.last_sign_in_at ?? null,
    sessionExpiresAt: authSession?.expires_at ?? null,
  })

  const dialogs: ReactNode =
    dialog === 'shortcuts' ? (
      <KeyboardShortcutsDialog onClose={() => setDialog(null)} />
    ) : dialog === 'report' ? (
      <ReportProblemDialog rows={rows} onClose={() => setDialog(null)} />
    ) : dialog === 'session' ? (
      <SessionDetailsDialog rows={rows} onClose={() => setDialog(null)} />
    ) : null

  return { nodes, dialogs, openSessionDetails: () => setDialog('session') }
}

function Trigger(props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; 'aria-controls': string }) {
  const { profile } = useAuth()
  return (
    <button
      type="button"
      {...props}
      aria-label={`Menú de usuario: ${profile?.fullName ?? ''}`}
      className="rounded-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brasa-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
    >
      <Avatar avatarKey={profile?.avatarKey} seed={profile?.id} size="sm" />
    </button>
  )
}

/**
 * Menú de usuario dentro de una cuenta (ADR 0023): quién soy; rol y cuenta,
 * cada uno con su submenú; mis cosas; administración según permisos;
 * Apariencia; Ayuda y soporte; Detalles de la sesión; Cerrar sesión.
 */
export function UserMenu({ placement }: { placement: 'right-end' | 'bottom-end' }) {
  const { kitchen, organization, can, path, setActiveRole } = useActiveKitchen()
  const { data: kitchens } = useMyKitchens()
  const { data: ctx } = useMyContext()
  const switchAccount = useSwitchAccount()
  const navigate = useNavigate()
  const { show } = useToast()

  const canAdminOrg = canOpenAdminCenter(organization)
  const orgUsers = organization?.permissions.includes('users.view') ?? false
  // "Equipo de la cuenta": who manages THIS account's team without managing the organization.
  const canAccountTeam = canAccessModule(can, 'users') && !orgUsers
  const orgAccounts = (kitchens ?? []).filter((k) => k.organizationId === kitchen.organizationId)
  const organizations = (ctx?.organizations ?? []).filter((o) => o.status === 'active' && (o.active || ctx?.profile.isPlatformAdmin))
  const activeRole = kitchen.roleOptions.find((r) => r.id === kitchen.activeRoleId)

  const common = useCommonMenu({
    organization: organization ? { name: organization.name, code: organization.tenantCode } : null,
    account: { name: kitchen.name, slug: kitchen.slug },
    role: kitchen.roleName,
    permissionCount: activeRole?.permissions.length ?? null,
  })

  const items: MenuNode[] = [
    { kind: 'section', id: 'role-title', label: kitchen.roleOptions.length > 1 ? 'Cambiar de rol' : 'Rol' },
    kitchen.roleOptions.length > 1
      ? {
          kind: 'submenu',
          id: 'role',
          label: kitchen.roleName,
          icon: BadgeCheck,
          children: kitchen.roleOptions.map((role) => ({
            kind: 'item' as const,
            id: `role-${role.id}`,
            label: role.name,
            hint: roleSummary(role.permissions),
            checked: role.id === kitchen.activeRoleId,
            onSelect: () => {
              if (role.id === kitchen.activeRoleId) return
              setActiveRole(role.id)
              show(`Ahora trabajas como ${role.name}.`)
            },
          })),
        }
      : {
          kind: 'custom',
          id: 'role-only',
          render: () => (
            <p className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-200">
              <BadgeCheck size={16} className="text-neutral-400" aria-hidden /> {kitchen.roleName}
            </p>
          ),
        },
    { kind: 'separator', id: 'sep-role' },
    { kind: 'section', id: 'account-title', label: 'Cuenta' },
    {
      kind: 'submenu',
      id: 'account',
      label: kitchen.name,
      hint: organization ? `${organization.name} · ${organization.tenantCode}` : kitchen.organizationName,
      icon: Store,
      children: [
        {
          kind: 'custom',
          id: 'org-title',
          render: () => (
            <p className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
              {organization?.name ?? kitchen.organizationName}
              {organization && <span className="font-mono"> · {organization.tenantCode}</span>}
            </p>
          ),
        },
        ...orgAccounts.map((k) => ({
          kind: 'item' as const,
          id: `account-${k.id}`,
          label: k.name,
          hint: `${k.roleName}${k.active ? '' : ' · desactivada'}`,
          icon: Store,
          checked: k.id === kitchen.id,
          onSelect: () => switchAccount(k),
        })),
        { kind: 'separator', id: 'account-sep' },
        {
          kind: 'item',
          id: 'account-details',
          label: 'Ver detalles de la cuenta',
          icon: Info,
          onSelect: () => (can('settings.manage') ? navigate(path('/settings/general')) : common.openSessionDetails()),
        },
        ...(organizations.length > 1
          ? [
              {
                kind: 'submenu' as const,
                id: 'organizations',
                label: 'Cambiar de organización',
                icon: Building2,
                children: organizationNodes(organizations, kitchen.organizationId, () => navigate('/cuentas')),
              },
            ]
          : []),
        { kind: 'item', id: 'all-accounts', label: 'Tus cuentas', icon: LayoutList, onSelect: () => navigate('/cuentas') },
      ],
    },
    { kind: 'separator', id: 'sep-account' },
    { kind: 'item', id: 'profile', label: 'Mi perfil', icon: UserRound, onSelect: () => navigate(path('/perfil')) },
    { kind: 'item', id: 'shifts', label: 'Mis turnos', icon: CalendarClock, onSelect: () => navigate(path('/my-shifts')) },
    ...(canAccessModule(can, 'settings') ? [{ kind: 'item' as const, id: 'settings', label: 'Configuración', icon: Settings, onSelect: () => navigate(path('/settings')) }] : []),
    ...(canAccountTeam ? [{ kind: 'item' as const, id: 'team', label: 'Equipo de la cuenta', icon: Users, onSelect: () => navigate(path('/users')) }] : []),
    ...(canAdminOrg && organization
      ? [{ kind: 'item' as const, id: 'org-admin', label: 'Administración de la organización', icon: Building2, onSelect: () => navigate(orgPath(organization.slug)) }]
      : []),
    ...common.nodes,
  ]

  return (
    <>
      <MenuPanel label="Menú de usuario" placement={placement} header={<Header />} items={items} trigger={(props) => <Trigger {...props} />} />
      {common.dialogs}
    </>
  )
}

/**
 * The same menu in the organization's administration center (ADR 0023,
 * D6): there is no active account, so "Organización" takes its place.
 */
export function OrgUserMenu() {
  const { organization } = useOrgAdmin()
  const { data: ctx } = useMyContext()
  const navigate = useNavigate()
  const organizations = (ctx?.organizations ?? []).filter((o) => o.status === 'active' && (o.active || ctx?.profile.isPlatformAdmin))
  const common = useCommonMenu({
    organization: { name: organization.name, code: organization.tenantCode },
    account: null,
    role: organization.isSuperAdmin ? 'Organization Admin' : 'Administración',
    permissionCount: organization.permissions.length,
  })

  const items: MenuNode[] = [
    { kind: 'section', id: 'org-title', label: 'Organización' },
    {
      kind: 'submenu',
      id: 'organization',
      label: organization.name,
      hint: `${organization.tenantCode} · ${tenantHostLabel(organization.tenantCode)}`,
      icon: Building2,
      children: [
        ...(organizations.length > 1
          ? [{ kind: 'section' as const, id: 'switch-title', label: 'Cambiar de organización' }, ...organizationNodes(organizations, organization.id, () => navigate('/cuentas')), { kind: 'separator' as const, id: 'org-sep' }]
          : []),
        { kind: 'item', id: 'all-accounts', label: 'Tus cuentas', icon: LayoutList, onSelect: () => navigate('/cuentas') },
      ],
    },
    { kind: 'separator', id: 'sep-org' },
    ...common.nodes,
  ]

  return (
    <>
      <MenuPanel label="Menú de usuario" placement="bottom-end" header={<Header />} items={items} trigger={(props) => <Trigger {...props} />} />
      {common.dialogs}
    </>
  )
}
