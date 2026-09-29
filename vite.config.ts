import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Metadatos para compartir (ADR 0011, H5): las redes exigen URL absolutas en
 * og:image y og:url. Se toman de VITE_SITE_URL (p. ej. https://darkkitchen.co);
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
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: false,
    },
  }
})
