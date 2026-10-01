/** Plain names of the feature keys (the catalog lives in dk_features). */
export const FEATURE_LABEL: Record<string, string> = {
  supply_reorder: 'Sugerencias de compra',
  supply_perishables: 'Perecederos en riesgo',
  supply_slow_movers: 'Poco movimiento',
  kitchen_stall_alerts: 'Pedidos detenidos',
  kitchen_insights: 'Sugerencias de Cocina',
  voice_commands: 'Comandos de voz',
  voice_speech: 'Voz de la aplicación',
  voice_wake_word: 'Manos libres',
}

export const featureLabel = (key: string) => FEATURE_LABEL[key] ?? key
