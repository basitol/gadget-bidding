import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Shared package builds to CJS; Vite needs the TS source for the browser.
      '@gadget-bidding/shared': path.resolve(
        __dirname,
        '../shared/src/index.ts'
      ),
    },
  },
  optimizeDeps: {
    exclude: ['@gadget-bidding/shared'],
  },
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    target: 'es2020',
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('socket.io')) return 'socket';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('@fontsource-variable')) return 'fonts';
          if (
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('react-router') ||
            id.includes('scheduler') ||
            id.includes('radix-ui') ||
            id.includes('@radix-ui')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
