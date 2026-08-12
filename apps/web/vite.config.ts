import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// PH-02 scaffold. Dev proxy per ADR-001/005: the browser only ever talks to the
// Vite origin, so cookies/CSRF flow without CORS configuration in development.
export default defineConfig({
  plugins: [tailwindcss(), react({})],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
