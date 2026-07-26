import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@nexus/kernel': path.resolve(__dirname, '../nexus-kernel/src/index.ts'),
      '@nexus/agent': path.resolve(__dirname, '../nexus-agent/src/index.ts'),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});