import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
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
