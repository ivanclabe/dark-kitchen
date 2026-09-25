import { supabase } from '@/shared/lib/supabase'

/** Un rol asignado al usuario en una Cuenta, con sus permisos (claves del catálogo). */
export interface AccountRole {
  id: string
  key: string
  name: string
  isSystem: boolean
  permissions: string[]
}

export interface MyOrganization {
  id: string
  slug: string
  name: string
  active: boolean
  isOwner: boolean
  isSuperAdmin: boolean
  status: 'pending' | 'active' | 'disabled'
  /** Permisos de organización (users.manage, accounts.create…). */
  permissions: string[]
}

export interface MyAccountRow {
  id: string
  slug: string
  name: string
  organizationId: string
  /** Icono de establecimiento (galería de Cuentas); null = derivado del id. */
  iconKey: string | null
  active: boolean
  /** SUPER_ADMIN (creador de la organización, o la plataforma): puede trabajar con acceso total. */
  superAdmin: boolean
  defaultRoleId: string | null
  roles: AccountRole[]
}

/** Todo lo que la app necesita saber del usuario (dk_my_context, ADR 0008 13.1). */
export interface MyContext {
  profile: { id: string; fullName: string; avatarKey: string | null; active: boolean; isPlatformAdmin: boolean; lastAccountId: string | null }
  /** Todas las claves de permisos de Cuenta: las del acceso total (SUPER_ADMIN). */
  accountPermissions: string[]
  organizations: MyOrganization[]
  accounts: MyAccountRow[]
}

export async function fetchMyContext(): Promise<MyContext | null> {
  const { data, error } = await supabase.rpc('dk_my_context')
  if (error) throw error
  return (data as unknown as MyContext | null) ?? null
}

/** Rol activo "acceso total" del SUPER_ADMIN (no es un rol de la base; la base lo reconoce en x-dk-role-id). */
export const SUPER_ADMIN_ROLE_ID = 'super-admin'

/**
 * Una Cuenta tal como la ve la app: con su organización y el rol con el
 * que se trabaja (rol activo). `permissions` son los del rol activo.
 */
export interface MyKitchen {
  id: string
  slug: string
  name: string
  iconKey: string | null
  active: boolean
  organizationId: string
  organizationName: string
  superAdmin: boolean
  isPlatformAdmin: boolean
  /** Roles que puede elegir como rol activo (incluye SUPER_ADMIN si aplica). */
  roleOptions: AccountRole[]
  activeRoleId: string
  roleKey: string
  roleName: string
  /** Claves del catálogo de permisos del rol activo (p. ej. "orders.confirm"). */
  permissions: ReadonlySet<string>
}

export function roleOptionsFor(account: MyAccountRow, ctx: Pick<MyContext, 'accountPermissions' | 'profile'>): AccountRole[] {
  const superRole: AccountRole[] = account.superAdmin
    ? [
        {
          id: SUPER_ADMIN_ROLE_ID,
          key: 'SUPER_ADMIN',
          name: 'SUPER_ADMIN',
          isSystem: true,
          permissions: ctx.accountPermissions,
        },
      ]
    : []
  return [...superRole, ...account.roles]
}

/** Rol activo: el pedido si sigue asignado; si no, acceso total (SUPER_ADMIN) o el predeterminado. */
export function resolveActiveRoleId(account: MyAccountRow, options: AccountRole[], requested: string | null): string {
  if (requested && options.some((r) => r.id === requested)) return requested
  if (account.superAdmin) return SUPER_ADMIN_ROLE_ID
  return account.defaultRoleId ?? options[0]?.id ?? ''
}

export function toKitchenView(ctx: MyContext, account: MyAccountRow, requestedRoleId: string | null): MyKitchen {
  const roleOptions = roleOptionsFor(account, ctx)
  const activeRoleId = resolveActiveRoleId(account, roleOptions, requestedRoleId)
  const role = roleOptions.find((r) => r.id === activeRoleId)
  return {
    id: account.id,
    slug: account.slug,
    name: account.name,
    iconKey: account.iconKey ?? null,
    active: account.active,
    organizationId: account.organizationId,
    organizationName: ctx.organizations.find((o) => o.id === account.organizationId)?.name ?? '',
    superAdmin: account.superAdmin,
    isPlatformAdmin: ctx.profile.isPlatformAdmin,
    roleOptions,
    activeRoleId,
    roleKey: role?.key ?? '',
    roleName: role?.name ?? 'Sin rol',
    permissions: new Set(role?.permissions ?? []),
  }
}

export async function createKitchen(name: string, slug: string, organizationId?: string, iconKey?: string): Promise<string> {
  const { data, error } = await supabase.rpc('dk_create_kitchen', {
    p_name: name,
    p_slug: slug,
    ...(organizationId ? { p_organization_id: organizationId } : {}),
    ...(iconKey ? { p_icon_key: iconKey } : {}),
  })
  if (error) throw error
  return data
}

export interface KitchenDetails {
  id: string
  slug: string
  name: string
  legalName: string | null
  taxId: string | null
  phone: string | null
  address: string | null
  timezone: string
  currency: string
  iconKey: string | null
  active: boolean
}

export async function getKitchenDetails(id: string): Promise<KitchenDetails> {
  const { data, error } = await supabase
    .from('dk_kitchens')
    .select('id, slug, name, legal_name, tax_id, phone, address, timezone, currency, icon_key, active')
    .eq('id', id)
    .single()
  if (error) throw error
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    legalName: data.legal_name,
    taxId: data.tax_id,
    phone: data.phone,
    address: data.address,
    timezone: data.timezone,
    currency: data.currency,
    iconKey: data.icon_key,
    active: data.active,
  }
}

export type KitchenDetailsInput = Pick<KitchenDetails, 'name' | 'slug' | 'legalName' | 'taxId' | 'phone' | 'address' | 'timezone' | 'iconKey'>

/** Última Cuenta usada, guardada en el perfil (sirve en cualquier equipo). La base valida el acceso. */
export async function setLastAccount(accountId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_set_last_account', { p_kitchen_id: accountId })
  if (error) throw error
}

export async function updateKitchenDetails(id: string, input: KitchenDetailsInput): Promise<void> {
  const { error } = await supabase
    .from('dk_kitchens')
    .update({
      name: input.name.trim(),
      slug: input.slug.trim(),
      legal_name: input.legalName?.trim() || null,
      tax_id: input.taxId?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      timezone: input.timezone,
      icon_key: input.iconKey,
    })
    .eq('id', id)
  if (error) throw error
}
