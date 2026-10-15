/**
 * Chart colors from the theme tokens (ADR 0061): recharts takes them as SVG attributes and inline styles,
 * where `var(--…)` works, so one chart reads the same in dark, light and neutral. Before, they were the
 * dark theme's hex values (a black tooltip on the light themes).
 */
export const chartAxisTick = { fill: 'var(--color-neutral-500)', fontSize: 11 }
export const chartGrid = 'var(--color-neutral-800)'
export const chartCursor = { fill: 'var(--color-neutral-800)', fillOpacity: 0.5 }
export const chartTooltip = {
  contentStyle: {
    background: 'var(--color-neutral-900)',
    border: '1px solid var(--color-neutral-800)',
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--color-neutral-100)',
    boxShadow: 'var(--shadow-float)',
  },
  labelStyle: { color: 'var(--color-neutral-300)' },
  itemStyle: { color: 'var(--color-neutral-100)' },
}
/** Series: the brand for the main one, the danger color for errors. */
export const chartBrand = 'var(--color-brasa-500)'
export const chartDanger = 'var(--color-red-400)'
