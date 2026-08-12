import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// PH-02 scaffold. Dev proxy per ADR-001/005: the browser only ever talks to the
// Vite origin, so cookies/CSRF flow without CORS configuration in development.
export default defineConfig({
  plugins: [react({})],
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
