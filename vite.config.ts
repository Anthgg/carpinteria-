import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';
const herouiStyles = fileURLToPath(new URL('./node_modules/@heroui/styles/dist/heroui.min.css', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@heroui/prebuilt.css': herouiStyles } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
    watch: {
      usePolling: true,
      interval: 400,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
