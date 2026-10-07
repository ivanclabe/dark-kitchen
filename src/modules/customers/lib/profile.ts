import type { BadgeTone } from '@/shared/ui/Badge'
import type { ComplaintCategory, ComplaintStatus, CustomerComplaint, CustomerPreference, PreferenceKind } from '../types'

/** ADR 0040: labels of the 360° sheet. */
export const COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  quality: 'Calidad del plato',
  delay: 'Demora',
  wrong_order: 'Pedido equivocado',
  missing_item: 'Faltó algo',
  delivery: 'Domicilio',
  service: 'Atención',
  billing: 'Cobro',
  other: 'Otro',
}

export const COMPLAINT_STATUS: Record<ComplaintStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  in_review: { label: 'En revisión', tone: 'info' },
  resolved: { label: 'Resuelta', tone: 'success' },
}

export const PREFERENCE_KIND: Record<PreferenceKind, { title: string; empty: string; tone: BadgeTone }> = {
  favorite_dish: { title: 'Platos favoritos', empty: 'Sin platos favoritos todavía.', tone: 'brand' },
  liked_ingredient: { title: 'Le gusta', empty: 'Sin ingredientes preferidos.', tone: 'success' },
  disliked_ingredient: { title: 'No le gusta', empty: 'Nada anotado.', tone: 'danger' },
  dietary: { title: 'Preferencias alimentarias', empty: 'Sin preferencias alimentarias.', tone: 'info' },
}

/** Quick picks for what the customer says about their diet (free text is also allowed). */
export const DIETARY_SUGGESTIONS = ['Vegetariano', 'Vegano', 'Sin gluten', 'Sin lactosa', 'Sin cerdo', 'Bajo en sal', 'Sin azúcar', 'Picante', 'Sin picante']

export function preferencesOf(list: CustomerPreference[], kind: PreferenceKind): CustomerPreference[] {
  return list.filter((p) => p.kind === kind)
}

export function openComplaints(list: CustomerComplaint[]): CustomerComplaint[] {
  return list.filter((c) => c.status !== 'resolved')
}

/** «Cada 10 días», «Cada semana», «Cada mes»… from the average days between orders; null with fewer than two orders. */
export function frequencyLabel(avgDays: number | null): string | null {
  if (avgDays === null) return null
  if (avgDays < 1.5) return 'A diario'
  if (avgDays >= 6 && avgDays <= 8) return 'Cada semana'
  if (avgDays >= 13 && avgDays <= 16) return 'Cada dos semanas'
  if (avgDays >= 27 && avgDays <= 33) return 'Cada mes'
  return `Cada ${Math.round(avgDays)} días`
}
