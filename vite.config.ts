import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega as variáveis do arquivo .env
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    // Define a base como raiz absoluta para deploy em VPS
    base: '/mentoria/',
    define: {
      // Injeta apenas a API Key de forma segura
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
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
    }
  }
})
