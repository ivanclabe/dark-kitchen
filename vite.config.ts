/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Metadatos para compartir (ADR 0011, H5): las redes exigen URL absolutas en
 * og:image y og:url. Se toman de VITE_SITE_URL (p. ej. https://quanela.co);
 * sin ella quedan relativas.
 */
function siteUrl(url: string | undefined): Plugin {
  const base = (url ?? '').trim().replace(/\/+$/, '')
  return { name: 'dk-site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', base) }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss(), siteUrl(env.VITE_SITE_URL)],
    // Version shown in "Detalles de la sesión" (ADR 0023): the deploy's commit on Vercel.
    define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? env.VITE_APP_VERSION ?? '').slice(0, 7)) },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
        // Global Admin portal (ADR 0019): only so its tests run with the rest.
        '@admin': path.resolve(import.meta.dirname, './admin/src'),
      },
    },
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: false,
    },
    // Tests run in path mode (no subdomains) unless a test sets the root domain itself (ADR 0021),
    // and with the owner sign-up methods off unless a test turns them on (ADR 0025): .env.local never leaks in.
    test: { env: { VITE_TENANT_ROOT_DOMAIN: '', VITE_AUTH_GOOGLE: '', VITE_AUTH_INSTAGRAM: '', VITE_AUTH_PHONE: '' } },
  }
})
