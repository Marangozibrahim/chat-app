import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    allowedHosts: ['chatapp.ibrahimmarangoz.com'],
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': { target: 'http://backend:8000', rewrite: (p) => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://backend:8000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
