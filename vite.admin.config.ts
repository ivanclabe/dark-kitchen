import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

/**
 * Quanela Global Admin (ADR 0019): its own entry, build and URL
 * (admin.quanela.com). It reuses the base UI of Quanela (src/shared/ui) and
 * the platform AI screens, but every import of the Supabase client resolves to
 * the portal's own client (separate session, no account headers).
 */
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'admin'),
  envDir: import.meta.dirname,
  publicDir: path.resolve(import.meta.dirname, 'admin/public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@/shared/lib/supabase', replacement: path.resolve(import.meta.dirname, 'admin/src/lib/supabase.ts') },
      { find: '@admin', replacement: path.resolve(import.meta.dirname, 'admin/src') },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
    ],
  },
  build: {
    outDir: process.env.ADMIN_OUT_DIR ?? path.resolve(import.meta.dirname, 'dist-admin'),
    emptyOutDir: true,
  },
  server: { port: 5174, strictPort: false },
})
