import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log em produção
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'charts-vendor': ['recharts'],
          'utils-vendor': ['date-fns', 'xlsx', 'axios'],
        },
        // Otimização de nomes de arquivos
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    // Otimização de tamanho do bundle
    chunkSizeWarningLimit: 1000,
    // Compressão de assets
    assetsInlineLimit: 4096,
  },
  base: './',
  // Otimização de resolução de módulos
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // Otimização de pré-carregamento
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
  },
})

