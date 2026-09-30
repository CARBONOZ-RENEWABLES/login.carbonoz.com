/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  // Pre-bundled in dev so the first PDF export doesn't trigger a dependency re-optimisation reload.
  optimizeDeps: { include: ['jspdf', 'jspdf-autotable'] },
  test: {
    // Unit tests call the API client against an absolute URL (fetch is stubbed).
    env: { VITE_API_URL: 'http://localhost/api' },
  },
  server: {
    proxy: {
      // Dev only: mirror production Nginx, which serves the API under /api on the same origin
      // (needed for the SSO session cookie). Use with VITE_API_URL=/api.
      '/api': {
        target: process.env.API_DEV_TARGET || 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
})
