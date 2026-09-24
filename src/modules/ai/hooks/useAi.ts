import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAiConnectionStatus, getKitchenSignals, getLatestInsight, listAiFeatures, listInventorySignals, requestInsight, updateAiFeature } from '../api/ai'
import { numberSetting, withDefaults } from '../lib/catalog'
import type { AiFeature, AiFeatureKey, AiInsightFeatureKey, AiSettings } from '../types'

const FEATURES_KEY = ['ai-features'] as const
const INSIGHT_KEY = ['ai-insight'] as const
// Bajo el prefijo de las sugerencias de Abastecimiento: toda mutación que ya las
// invalida (compras, mermas, ajustes, consumo en cocina, edición de insumos) refresca también las señales.
export const INVENTORY_SIGNALS_KEY = ['supply-suggestions', 'signals'] as const

export function useAiFeatures() {
  return useQuery({ queryKey: FEATURES_KEY, queryFn: listAiFeatures, staleTime: 60_000 })
}

/** Una función con su configuración ya completada con los valores por defecto. Mientras carga: desactivada. */
export function useAiFeature(key: AiFeatureKey): { enabled: boolean; settings: AiSettings; loaded: boolean } {
  const { data } = useAiFeatures()
  const row = data?.find((f: AiFeature) => f.key === key)
  return { enabled: row?.enabled ?? false, settings: withDefaults(key, row?.settings), loaded: data !== undefined }
}

export function useUpdateAiFeature() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, enabled, settings }: { key: AiFeatureKey; enabled: boolean; settings: AiSettings }) => updateAiFeature(key, { enabled, settings }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
      void queryClient.invalidateQueries({ queryKey: INSIGHT_KEY })
      void queryClient.invalidateQueries({ queryKey: INVENTORY_SIGNALS_KEY })
    },
  })
}

export function useAiConnectionStatus() {
  return useQuery({ queryKey: ['ai-connection'], queryFn: getAiConnectionStatus, staleTime: 5 * 60_000, retry: false })
}

/**
 * Análisis de una función. Se pide al montar y, si `live`, cada
 * `frequency_min`; la Edge Function reutiliza el último mientras esté
 * vigente, así que varias pantallas abiertas no multiplican las llamadas al modelo.
 */
export function useAiInsight(feature: AiInsightFeatureKey, enabled: boolean, options: { live?: boolean } = {}) {
  const { settings } = useAiFeature(feature)
  const frequencyMs = numberSetting(settings, 'frequency_min', 60) * 60_000
  return useQuery({
    queryKey: [...INSIGHT_KEY, feature],
    queryFn: () => requestInsight(feature),
    enabled,
    staleTime: frequencyMs,
    refetchInterval: enabled && options.live ? frequencyMs : false,
    retry: false,
  })
}

export function useRefreshAiInsight(feature: AiInsightFeatureKey) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => requestInsight(feature, true),
    onSuccess: (result) => queryClient.setQueryData([...INSIGHT_KEY, feature], result),
  })
}

export function useLatestAiInsight(feature: AiInsightFeatureKey) {
  return useQuery({ queryKey: [...INSIGHT_KEY, 'latest', feature], queryFn: () => getLatestInsight(feature) })
}

/**
 * Señales de inventario con los umbrales configurados. Se invalida con los
 * mismos datos que la vista de sugerencias (compras, mermas, ajustes).
 */
export function useInventorySignals(enabled: boolean) {
  const reorder = useAiFeature('supply_reorder')
  const perishables = useAiFeature('supply_perishables')
  const slow = useAiFeature('supply_slow_movers')
  const params = {
    coverageDays: numberSetting(reorder.settings, 'coverage_days', 7),
    warningDays: numberSetting(perishables.settings, 'warning_days', 2),
    slowDays: numberSetting(slow.settings, 'slow_days', 21),
    overstockDays: numberSetting(slow.settings, 'overstock_days', 60),
  }
  return useQuery({ queryKey: [...INVENTORY_SIGNALS_KEY, params], queryFn: () => listInventorySignals(params), enabled })
}

/** Foto de la cocina para las alertas de detenidos: cada 30 s mientras está activa. */
export function useKitchenSignals(enabled: boolean, dishStallMin: number) {
  return useQuery({
    queryKey: ['kitchen-queue', 'signals', dishStallMin],
    queryFn: () => getKitchenSignals(dishStallMin),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
}
