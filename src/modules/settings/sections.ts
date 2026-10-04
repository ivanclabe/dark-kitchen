import type { ActiveKitchen } from '@/shared/kitchen/activeKitchenContext'
import { Activity, CreditCard, Plug, Sparkles, Store, type LucideIcon } from 'lucide-react'

export type SettingsSection = { to: string; label: string; icon: LucideIcon }

/**
 * Sections of Configuración the active role can open (ADR 0024). Everything
 * is about the active account; what is shared with your other accounts (plan,
 * AI values, business data) says so where it is edited.
 */
export function settingsSections({ can, canShared }: Pick<ActiveKitchen, 'can' | 'canShared'>): SettingsSection[] {
  return [
    ...(can('settings.manage') || canShared('organization.manage') ? [{ to: '/settings/general', label: 'General', icon: Store }] : []),
    ...(canShared('billing.view') ? [{ to: '/settings/billing', label: 'Facturación', icon: CreditCard }] : []),
    ...(can('settings.manage') || can('ai.manage') || canShared('features.manage') ? [{ to: '/settings/ai', label: 'IA y voz', icon: Sparkles }] : []),
    ...(can('settings.manage') ? [{ to: '/settings/integrations', label: 'Integraciones', icon: Plug }] : []),
    ...(can('audit.view') || canShared('observability.view') ? [{ to: '/settings/activity', label: 'Actividad', icon: Activity }] : []),
  ]
}
