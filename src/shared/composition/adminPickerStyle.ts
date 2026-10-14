import type { CSSProperties } from 'react'

/**
 * ADR 0059: the option picker of the public menu (drawn with the page's `--pm-*` variables) inside the app —
 * the cashier and the composition editor. The app's own colors, so it follows its light or dark appearance.
 */
export const adminPickerStyle = {
  '--pm-bg': 'var(--color-neutral-950)',
  '--pm-surface': 'var(--color-neutral-900)',
  '--pm-text': 'var(--color-neutral-100)',
  '--pm-muted': 'var(--color-neutral-400)',
  '--pm-primary': 'var(--color-brasa-500)',
  '--pm-on-primary': '#FFFFFF',
  '--pm-price': 'var(--color-neutral-50)',
  '--pm-border': 'color-mix(in srgb, var(--color-neutral-100) 10%, transparent)',
  '--pm-soft': 'color-mix(in srgb, var(--color-neutral-100) 6%, transparent)',
  '--pm-font-heading': 'inherit',
  '--pm-btn-radius': '0.75rem',
} as CSSProperties
