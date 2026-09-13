export const labelClass = 'block text-sm font-medium text-neutral-300'
export const inputClass =
  'mt-1 w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-50 outline-none transition-colors focus:border-brasa-500 focus:ring-2 focus:ring-brasa-500/20'
export const primaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-brasa-500 to-brasa-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:from-brasa-400 hover:to-brasa-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'
export const secondaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
export const dangerButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-400 transition hover:border-red-800 hover:bg-red-950/70 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
export const cardClass = 'rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-card'
export const tableWrapperClass = 'overflow-x-auto rounded-xl border border-neutral-800 shadow-card'
export const thClass = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500'
export const tdClass = 'px-4 py-2 text-sm text-neutral-200'

export const chipClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-brasa-600 text-white'
      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
  }`
