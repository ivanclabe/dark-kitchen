import { supabase } from '@/shared/lib/supabase'
import type { Json } from '@/types/database'
import type { DocumentRef } from './documents'

/**
 * Where an acceptance happened (dk_legal_acceptances.context): ticked at sign-up or activation, asked when entering
 * the app (accounts older than this, or whose sign-up record failed), a new version, or the card's automatic renewal.
 */
export type AcceptanceContext = 'signup' | 'activation' | 'app_gate' | 'reacceptance' | 'billing_renewal'

/** Query key of the documents the signed-in person still has to accept. */
export const LEGAL_PENDING_KEY = ['legal-pending'] as const

/** The page showed an old version: the person must read the new one before accepting. */
export const STALE_VERSION = 'stale_version'

/** Records, as evidence, that the signed-in person accepted these document versions (ADR 0071). */
export async function recordLegalAcceptance(input: {
  documents: DocumentRef[]
  context: AcceptanceContext
  details?: Record<string, Json>
  organizationId?: string
}): Promise<void> {
  const { error } = await supabase.rpc('dk_record_legal_acceptance', {
    p_documents: input.documents as unknown as Json,
    p_context: input.context,
    p_details: (input.details ?? {}) as Json,
    p_organization_id: input.organizationId,
  })
  if (error) throw error
}

export interface PendingLegalDocument {
  slug: string
  version: string
  title: string
  effectiveDate: string
  /** first: never accepted; new_version: a version that asks for a new acceptance. */
  reason: 'first' | 'new_version'
}

export async function fetchPendingLegalDocuments(): Promise<PendingLegalDocument[]> {
  const { data, error } = await supabase.rpc('dk_my_pending_legal_documents')
  if (error) throw error
  return (data ?? []).map((d) => ({ slug: d.slug, version: d.version, title: d.title, effectiveDate: d.effective_date, reason: d.reason as PendingLegalDocument['reason'] }))
}

export interface LegalAcceptance {
  slug: string
  version: string
  title: string
  action: string
  context: AcceptanceContext
  consentedAt: string
}

export async function fetchMyLegalAcceptances(): Promise<LegalAcceptance[]> {
  const { data, error } = await supabase.rpc('dk_my_legal_acceptances')
  if (error) throw error
  return (data ?? []).map((a) => ({
    slug: a.document_slug,
    version: a.document_version,
    title: a.title,
    action: a.action,
    context: a.context as AcceptanceContext,
    consentedAt: a.consented_at,
  }))
}

export type PqrKind = 'consulta' | 'reclamo' | 'rectificacion' | 'supresion' | 'revocatoria' | 'reembolso' | 'retracto' | 'queja'

export interface PqrRequest {
  id: string
  radicado: string
  kind: PqrKind
  status: 'radicada' | 'en_tramite' | 'incompleta' | 'respondida' | 'cerrada'
  description: string
  legalBasis: string
  dueDate: string
  extendedDueDate: string | null
  response: string | null
  createdAt: string
  answeredAt: string | null
}

export async function createPqr(input: { kind: PqrKind; description: string; organizationId?: string }): Promise<{ radicado: string; dueDate: string }> {
  const { data, error } = await supabase.rpc('dk_create_pqr', {
    p_kind: input.kind,
    p_description: input.description,
    p_organization_id: input.organizationId,
  })
  if (error) throw error
  const result = data as { radicado: string; dueDate: string }
  return { radicado: result.radicado, dueDate: result.dueDate }
}

export async function fetchMyPqrs(): Promise<PqrRequest[]> {
  const { data, error } = await supabase.rpc('dk_my_pqr_requests')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    radicado: r.radicado,
    kind: r.kind as PqrKind,
    status: r.status as PqrRequest['status'],
    description: r.description,
    legalBasis: r.legal_basis,
    dueDate: r.due_date,
    extendedDueDate: r.extended_due_date,
    response: r.response,
    createdAt: r.created_at,
    answeredAt: r.answered_at,
  }))
}

/** Ley 1581 art. 8: the person's own data, as a JSON file. */
export async function exportMyData(): Promise<Json> {
  const { data, error } = await supabase.rpc('dk_export_my_data')
  if (error) throw error
  return data
}
