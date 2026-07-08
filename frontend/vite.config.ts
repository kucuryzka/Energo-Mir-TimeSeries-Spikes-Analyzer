import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/dist/' : '/',
  server: {
    proxy: {
      '/api/dist/hangfire': {
        target: 'http://localhost:5090',
        changeOrigin: true,
      },
      '/api/dist/api': {
        target: 'http://localhost:5090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dist\/api/, '/api'),
      },
    },
  },
}))
