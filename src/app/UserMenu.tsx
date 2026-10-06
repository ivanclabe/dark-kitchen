import { useCopilot } from '@/modules/copilot/copilotContext'
import { useAppearance } from '@/shared/appearance/appearance'
import { Avatar } from '@/shared/avatars/Avatar'
import { useAuth } from '@/shared/hooks/useAuth'
import { useActiveKitchen, useMyKitchens } from '@/shared/kitchen/activeKitchenContext'
import { settingsSections } from '@/modules/settings/sections'
import { tenantHostLabel } from '@/shared/tenant/host'
import { MenuPanel, type MenuNode } from '@/shared/ui/MenuPanel'
import { useToast } from '@/shared/ui/Toast'
import {
  BadgeCheck,
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

/**
 * The end of the menu: Apariencia, Ayuda y soporte, Detalles de la sesión and
 * Cerrar sesión — plus the windows they open, which live outside the menu
 * (it closes on select).
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
        { kind: 'separator', id: 'help-sep' },
        { kind: 'item', id: 'help-center', label: 'Centro de ayuda', icon: CircleHelp, external: true, onSelect: () => open(helpUrl) },
        ...(email ? [{ kind: 'item' as const, id: 'support-mail', label: 'Escribir a soporte', hint: email, icon: Mail, external: true, onSelect: () => open(`mailto:${email}`) }] : []),
        ...(whatsapp ? [{ kind: 'item' as const, id: 'support-wa', label: 'Soporte por WhatsApp', icon: MessageCircle, external: true, onSelect: () => open(whatsapp) }] : []),
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
 * Menú de usuario (ADR 0023, ADR 0024): quién soy; rol y cuenta, cada uno con
 * su submenú (todas tus cuentas en una lista: las de otro negocio abren su
 * espacio); mis cosas; la administración de ESTA cuenta según permisos;
 * Apariencia; Ayuda y soporte; Detalles de la sesión; Cerrar sesión.
 */
export function UserMenu({ placement }: { placement: 'right-end' | 'bottom-end' }) {
  const active = useActiveKitchen()
  const { kitchen, organization, can, path, setActiveRole } = active
  const { data: kitchens } = useMyKitchens()
  const switchAccount = useSwitchAccount()
  const navigate = useNavigate()
  const { show } = useToast()

  const activeRole = kitchen.roleOptions.find((r) => r.id === kitchen.activeRoleId)
  const sections = settingsSections(active)
  const go = (to: string) => () => navigate(path(to))

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
      hint: organization ? tenantHostLabel(organization.tenantCode) : undefined,
      icon: Store,
      children: [
        { kind: 'section', id: 'accounts-title', label: 'Tus cuentas' },
        ...(kitchens ?? []).map((k) => ({
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
        { kind: 'item', id: 'all-accounts', label: 'Todas tus cuentas', icon: LayoutList, onSelect: () => navigate('/cuentas') },
      ],
    },
    { kind: 'separator', id: 'sep-account' },
    { kind: 'item', id: 'profile', label: 'Mi perfil', icon: UserRound, onSelect: go('/perfil') },
    { kind: 'item', id: 'shifts', label: 'Mis turnos', icon: CalendarClock, onSelect: go('/my-shifts') },
    // One place to configure the account (ADR 0026, D5): its sections live inside Configuración; Usuarios is in the rail.
    ...(sections.length > 0
      ? [{ kind: 'item' as const, id: 'settings', label: 'Configuración de la cuenta', icon: Settings, onSelect: go('/settings') }]
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
