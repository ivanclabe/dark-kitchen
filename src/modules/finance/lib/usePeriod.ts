import { todayStr } from '@/shared/utils/format'
import { useState } from 'react'
import { presetRange, type DateRange, type PeriodPreset } from '@/modules/insights/lib/periods'

export interface Period {
  preset: PeriodPreset
  range: DateRange
}

/** The period of a Finanzas tab (the same presets as Insights). */
export function usePeriod(initial: Exclude<PeriodPreset, 'custom'> = 'month') {
  return useState<Period>(() => ({ preset: initial, range: presetRange(initial, todayStr()) }))
}
