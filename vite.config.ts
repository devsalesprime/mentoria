/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  // Define a base como raiz absoluta para deploy em VPS
  base: '/prosperus-mentor-diagnosis/',
  // SEC-08: No API keys injected into frontend bundle
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true
      },
      '/auth': {
        target: 'http://localhost:3005',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:3005',
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // A suite passou de 200 para ~800 testes em 5 dias; sob carga o teto padrao de 5 s derruba testes sadios.
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['utils/**', 'components/**', 'hooks/**'],
    },
  },
})
