import { supabase } from '@/shared/lib/supabase'
import type { Json } from '@/types/database'

// ---------------------------------------------------------------------------
// Usuarios de la organización (ADR 0008, secciones 10–11)
// ---------------------------------------------------------------------------

export interface OrgUserAccount {
  kitchenId: string
  kitchenName: string
  active: boolean
  defaultRoleId: string | null
  roleIds: string[]
}

export type OrgUserStatus = 'active' | 'pending' | 'disabled'

export interface OrgUser {
  userId: string
  fullName: string
  email: string | null
  avatarKey: string | null
  status: OrgUserStatus
  isSuperAdmin: boolean
  isOwner: boolean
  isMe: boolean
  activationExpiresAt: string | null
  accounts: OrgUserAccount[]
}

/** Usuarios de la organización. Un Administrador de Cuenta recibe solo los de sus Cuentas (lo filtra la base). */
export async function listOrgUsers(organizationId: string): Promise<OrgUser[]> {
  const { data, error } = await supabase.rpc('dk_org_users', { p_organization_id: organizationId })
  if (error) throw error
  return (data as unknown as OrgUser[]) ?? []
}

export interface AccountAssignment {
  kitchenId: string
  roleIds: string[]
  defaultRoleId: string
}

export interface CreateUserInput {
  organizationId: string
  fullName: string
  email: string
  assignments: AccountAssignment[]
}

/** Crea el usuario (queda pendiente) y devuelve su enlace de activación. */
export async function createOrgUser(input: CreateUserInput): Promise<{ userId: string; token: string }> {
  const { data, error } = await supabase.rpc('dk_create_user', {
    p_organization_id: input.organizationId,
    p_full_name: input.fullName,
    p_email: input.email,
    p_assignments: input.assignments.map((a) => ({ kitchen_id: a.kitchenId, role_ids: a.roleIds, default_role_id: a.defaultRoleId })) as unknown as Json,
  })
  if (error) throw error
  const result = data as { user_id: string; token: string }
  return { userId: result.user_id, token: result.token }
}

export async function resendActivation(organizationId: string, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('dk_resend_activation', { p_organization_id: organizationId, p_user_id: userId })
  if (error) throw error
  return data
}

export async function updatePendingUser(organizationId: string, userId: string, fullName: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('dk_update_pending_user', { p_organization_id: organizationId, p_user_id: userId, p_full_name: fullName, p_email: email })
  if (error) throw error
}

/** Activa o desactiva a alguien en la organización (el SUPER_ADMIN no se asigna: es solo del creador). */
export async function setOrgMemberActive(organizationId: string, userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('dk_set_org_member', { p_organization_id: organizationId, p_user_id: userId, p_active: active })
  if (error) throw error
}

export async function removeOrgMember(organizationId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_remove_org_member', { p_organization_id: organizationId, p_user_id: userId })
  if (error) throw error
}

/** Roles de una persona en una Cuenta (reemplaza los que tenía). La base aplica las reglas contra el escalamiento. */
export async function setMemberRoles(kitchenId: string, userId: string, roleIds: string[], defaultRoleId: string): Promise<void> {
  const { error } = await supabase.rpc('dk_set_member_roles', { p_kitchen_id: kitchenId, p_user_id: userId, p_role_ids: roleIds, p_default_role_id: defaultRoleId })
  if (error) throw error
}

export async function removeFromAccount(kitchenId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('dk_kitchen_members').delete().eq('kitchen_id', kitchenId).eq('user_id', userId)
  if (error) throw error
}

export function activationLink(token: string): string {
  return `${window.location.origin}/activar/${token}`
}

// ---------------------------------------------------------------------------
// Roles y catálogo de permisos
// ---------------------------------------------------------------------------

export interface OrgRole {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  /** Claves del catálogo (p. ej. "orders.confirm"). */
  permissions: string[]
}

/** Plantillas del sistema y roles propios de la organización, con sus permisos. */
export async function listOrgRoles(organizationId: string): Promise<OrgRole[]> {
  const { data, error } = await supabase
    .from('dk_roles')
    .select('id, key, name, description, is_system, dk_role_permissions ( permission_key )')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order('is_system', { ascending: false })
    .order('name')
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.is_system,
    permissions: (r.dk_role_permissions ?? []).map((p) => p.permission_key),
  }))
}

export interface PermissionDef {
  key: string
  module: string
  action: string
  label: string
  description: string | null
  sortOrder: number
}

/** Permisos de Cuenta del catálogo central (los de organización no van en roles propios). */
export async function listPermissionCatalog(): Promise<PermissionDef[]> {
  const { data, error } = await supabase
    .from('dk_permissions')
    .select('key, module, action, label, description, sort_order')
    .eq('scope', 'account')
    .order('sort_order')
  if (error) throw error
  return data.map((p) => ({ key: p.key, module: p.module, action: p.action, label: p.label, description: p.description, sortOrder: p.sort_order }))
}

export async function saveRole(input: { id: string | null; name: string; description: string; permissions: string[]; organizationId: string }): Promise<string> {
  const { data, error } = await supabase.rpc('dk_save_role', {
    p_role_id: input.id as string,
    p_name: input.name,
    p_description: input.description,
    p_permissions: input.permissions,
    p_organization_id: input.organizationId,
  })
  if (error) throw error
  return data
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabase.rpc('dk_delete_role', { p_role_id: id })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Organización y sus Cuentas
// ---------------------------------------------------------------------------

export interface OrganizationDetails {
  id: string
  slug: string
  name: string
  address: string | null
  city: string | null
  country: string
  sector: string | null
  category: string | null
  legalName: string | null
  taxId: string | null
  phone: string | null
  currency: string
  defaultTimezone: string
  ownerUserId: string
  active: boolean
}

export async function getOrganization(organizationId: string): Promise<OrganizationDetails> {
  const { data, error } = await supabase
    .from('dk_organizations')
    .select('id, slug, name, address, city, country, sector, category, legal_name, tax_id, phone, currency, default_timezone, owner_user_id, active')
    .eq('id', organizationId)
    .single()
  if (error) throw error
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    address: data.address,
    city: data.city,
    country: data.country,
    sector: data.sector,
    category: data.category,
    legalName: data.legal_name,
    taxId: data.tax_id,
    phone: data.phone,
    currency: data.currency,
    defaultTimezone: data.default_timezone,
    ownerUserId: data.owner_user_id,
    active: data.active,
  }
}

export type OrganizationInput = Pick<
  OrganizationDetails,
  'name' | 'address' | 'city' | 'country' | 'sector' | 'category' | 'legalName' | 'taxId' | 'phone' | 'currency' | 'defaultTimezone'
>

export async function updateOrganization(organizationId: string, input: OrganizationInput): Promise<void> {
  const { error } = await supabase
    .from('dk_organizations')
    .update({
      name: input.name.trim(),
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country,
      sector: input.sector || null,
      category: input.category || null,
      legal_name: input.legalName?.trim() || null,
      tax_id: input.taxId?.trim() || null,
      phone: input.phone?.trim() || null,
      currency: input.currency,
      default_timezone: input.defaultTimezone,
    })
    .eq('id', organizationId)
  if (error) throw error
}

export interface OrgAccount {
  id: string
  slug: string
  name: string
  /** Icono de establecimiento; null = derivado del id. */
  iconKey: string | null
  active: boolean
  createdAt: string
}

export async function listOrgAccounts(organizationId: string): Promise<OrgAccount[]> {
  const { data, error } = await supabase
    .from('dk_kitchens')
    .select('id, slug, name, icon_key, active, created_at')
    .eq('organization_id', organizationId)
    .order('name')
  if (error) throw error
  return data.map((k) => ({ id: k.id, slug: k.slug, name: k.name, iconKey: k.icon_key, active: k.active, createdAt: k.created_at }))
}

/** Nombre e icono de una Cuenta desde la organización (accounts.manage; la política de dk_kitchens lo exige). */
export async function updateAccount(id: string, input: { name: string; iconKey: string }): Promise<void> {
  const { data, error } = await supabase.from('dk_kitchens').update({ name: input.name.trim(), icon_key: input.iconKey }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('No tienes permiso para editar esta cuenta')
}

export async function setAccountsActive(ids: string[], active: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('dk_set_kitchens_active', { p_kitchen_ids: ids, p_active: active })
  if (error) throw error
  return data
}
