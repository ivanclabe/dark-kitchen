import { supabase } from '@/shared/lib/supabase'
import type { Granularity } from '../lib/range'

/** One bucket of «Destacado» (ADR 0072). Rates are 0-1; null = nothing to measure (never a fake zero). */
export interface SeriesPoint {
  t: string
  orders: number
  revenue: number
  averageTicket: number | null
  cancelledRate: number | null
  kitchenMinutes: number | null
  foodCostRate?: number | null
}

export interface SeriesTotals {
  orders: number
  revenue: number
  averageTicket: number | null
  cancelledRate: number | null
  kitchenMinutes: number | null
  foodCostRate?: number | null
}

export interface DashboardSeries {
  timezone: string
  currency: string
  granularity: Granularity
  /** The cost of food comes only with reports.profitability. */
  profitability: boolean
  period: { from: string; to: string }
  previousPeriod: { from: string; to: string }
  points: SeriesPoint[]
  totals: SeriesTotals
  previous: SeriesTotals
  channels: { channel: string; orders: number; revenue: number }[]
  topProducts: { id: string; name: string; units: number; revenue: number }[]
}

export async function fetchDashboardSeries(from: string, to: string, granularity: Granularity): Promise<DashboardSeries> {
  const { data, error } = await supabase.rpc('dk_dashboard_series', { p_from: from, p_to: to, p_granularity: granularity })
  if (error) throw error
  return data as unknown as DashboardSeries
}

/** The account's time zone (the ranges are days there, not in the browser). */
export async function fetchKitchenTimezone(kitchenId: string): Promise<string> {
  const { data, error } = await supabase.from('dk_kitchens').select('timezone').eq('id', kitchenId).single()
  if (error) throw error
  return data.timezone
}
