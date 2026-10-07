import type { FeatureCategory, FeatureKey, FeatureSettings } from '@/shared/features/features'
import { supabase } from '@/shared/lib/supabase'
import type { VoiceGender, VoiceLang, VoiceStyle } from '@/shared/voice/catalog'
import type { Json } from '@/types/database'

/** Platform AI administration (ADR 0014). Every RPC checks the platform admin in the database. */
export const PLATFORM_AI_KEY = ['platform', 'ai'] as const

export interface SettingRule {
  type: 'number' | 'boolean' | 'string'
  min?: number
  max?: number
  enum?: string[]
  ref?: string
}

export interface PlatformFeature {
  key: FeatureKey
  category: FeatureCategory
  label: string
  description: string
  active: boolean
  usesModel: boolean
  modelKey: string | null
  /** ADR 0041: model for questions asked by voice (only Copilot); null = modelKey. */
  voiceModelKey: string | null
  minIntervalSeconds: number | null
  dependsOn: FeatureKey[]
  defaultSettings: FeatureSettings
  settingsSchema: Record<string, SettingRule>
  plans: string[]
  organizationsOffering: number
  organizationsTotal: number
  accountsEnabled: number
  accountsTotal: number
  errors24h: number
  lastError: { at: string; message: string | null; account: string } | null
  issues: string[]
}

export interface PlatformModel {
  key: string
  provider: 'anthropic'
  label: string
  active: boolean
  inputPricePerMTok: number | null
  outputPricePerMTok: number | null
  usedBy: FeatureKey[]
}

export interface PlatformPlanLimits {
  key: string
  name: string
  status: string
  aiRunsPerDay: number | null
  aiMinIntervalSeconds: number | null
}

export interface PlatformAiOverview {
  features: PlatformFeature[]
  models: PlatformModel[]
  plans: PlatformPlanLimits[]
  recentChanges: { id: string; createdAt: string; summary: string | null; eventType: string | null; actor: string | null }[]
}

export async function fetchPlatformAiOverview(): Promise<PlatformAiOverview> {
  const { data, error } = await supabase.rpc('dk_platform_ai_overview')
  if (error) throw error
  return data as unknown as PlatformAiOverview
}

export async function setPlatformFeature(
  key: FeatureKey,
  change: { active?: boolean; modelKey?: string; minIntervalSeconds?: number | null; defaultSettings?: FeatureSettings },
): Promise<void> {
  const { error } = await supabase.rpc('dk_platform_set_feature', {
    p_key: key,
    ...(change.active !== undefined ? { p_active: change.active } : {}),
    ...(change.modelKey !== undefined ? { p_model_key: change.modelKey } : {}),
    // 0 = back to the plan limit.
    ...(change.minIntervalSeconds !== undefined ? { p_min_interval_seconds: change.minIntervalSeconds ?? 0 } : {}),
    ...(change.defaultSettings !== undefined ? { p_default_settings: change.defaultSettings as Json } : {}),
  })
  if (error) throw error
}

/** ADR 0041: the model for Copilot questions asked by voice; null = the feature's model. */
export async function setPlatformVoiceModel(key: FeatureKey, modelKey: string | null): Promise<void> {
  const { error } = await supabase.rpc('dk_platform_set_voice_model', { p_key: key, ...(modelKey ? { p_model_key: modelKey } : {}) })
  if (error) throw error
}

export async function setPlatformModel(model: { key: string; label: string; inputPricePerMTok: number | null; outputPricePerMTok: number | null; active: boolean }): Promise<void> {
  const { error } = await supabase.rpc('dk_platform_set_model', {
    p_key: model.key,
    p_label: model.label,
    ...(model.inputPricePerMTok !== null ? { p_input_price_per_mtok: model.inputPricePerMTok } : {}),
    ...(model.outputPricePerMTok !== null ? { p_output_price_per_mtok: model.outputPricePerMTok } : {}),
    p_active: model.active,
  })
  if (error) throw error
}

export async function setPlanAiLimits(planKey: string, aiRunsPerDay: number, aiMinIntervalSeconds: number | null): Promise<void> {
  const { error } = await supabase.rpc('dk_platform_set_plan_ai_limits', {
    p_plan_key: planKey,
    p_ai_runs_per_day: aiRunsPerDay,
    ...(aiMinIntervalSeconds !== null ? { p_ai_min_interval_seconds: aiMinIntervalSeconds } : {}),
  })
  if (error) throw error
}

export interface PlatformAiUsage {
  days: number
  totals: {
    runs: number
    errors: number
    runs24h: number
    meteredRuns: number
    inputTokens: number
    outputTokens: number
    /** null = no run with tokens and a priced model yet. */
    estimatedCost: number | null
    pricedRuns: number
    avgLatencyMs: number | null
  }
  meteringSince: string | null
  byFeature: { key: string; label: string | null; runs: number; errors: number; tokens: number; estimatedCost: number | null }[]
  byOrganization: { id: string; name: string; runs: number; errors: number; tokens: number; estimatedCost: number | null }[]
  byAccount: { id: string; name: string; organization: string; runs: number; errors: number; estimatedCost: number | null }[]
  byDay: { date: string; runs: number; errors: number }[]
}

export async function fetchPlatformAiUsage(days = 30): Promise<PlatformAiUsage> {
  const { data, error } = await supabase.rpc('dk_platform_ai_usage', { p_days: days })
  if (error) throw error
  return data as unknown as PlatformAiUsage
}

export async function setVoiceProfile(profile: {
  key: string
  name: string
  gender: VoiceGender
  defaultStyle: VoiceStyle
  pitch: number
  lang: VoiceLang
  deviceVoiceHints: string[]
  description: string
  active: boolean
}): Promise<void> {
  const { error } = await supabase.rpc('dk_platform_set_voice_profile', {
    p_key: profile.key,
    p_name: profile.name,
    p_gender: profile.gender,
    p_default_style: profile.defaultStyle,
    p_pitch: profile.pitch,
    p_lang: profile.lang,
    p_device_voice_hints: profile.deviceVoiceHints,
    p_description: profile.description,
    p_active: profile.active,
  })
  if (error) throw error
}

/** Estimated cost in USD (the catalog prices are USD per million tokens). */
export function formatUsd(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 4 : 2 }).format(value)
}
